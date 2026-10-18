// SPDX-License-Identifier: MIT
package localai

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/mudler/LocalAI/core/config"
	"github.com/mudler/LocalAI/core/gallery"
	"github.com/mudler/LocalAI/core/schema"
	"github.com/mudler/LocalAI/core/services/addons/hostops"
	"github.com/mudler/LocalAI/core/services/finetune"
	"github.com/mudler/LocalAI/core/services/quantization"
)

// engineBackendInfo is one backend that the fine-tuning and quantization
// backend endpoints list.
type engineBackendInfo struct {
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	Tags        []string `json:"tags,omitempty"`
}

// listTaggedBackends returns the installed gallery backends that carry tag. The
// backend endpoints and the add-on host operations share it, so both answer
// with the same list.
func listTaggedBackends(ctx context.Context, appConfig *config.ApplicationConfig, clusterCapabilities ClusterCapabilityProvider, clusterInstalled ClusterInstalledProvider, tag string) ([]engineBackendInfo, error) {
	capabilities := ResolveClusterCapabilities(ctx, clusterCapabilities)
	installed := resolveClusterInstalled(ctx, clusterInstalled)
	backends, err := gallery.AvailableBackendsForCapabilities(appConfig.BackendGalleries, appConfig.SystemState, capabilities)
	if err != nil {
		return nil, err
	}
	result := []engineBackendInfo{}
	for _, b := range backends {
		if !installedInCluster(b, installed) {
			continue
		}
		hasTag := false
		for _, t := range b.Tags {
			if strings.EqualFold(t, tag) {
				hasTag = true
				break
			}
		}
		if !hasTag {
			continue
		}
		name := b.Name
		if b.Alias != "" {
			name = b.Alias
		}
		result = append(result, engineBackendInfo{Name: name, Description: b.Description, Tags: b.Tags})
	}
	return result, nil
}

// EngineBackends names the fine-tuning and quantization backends the host
// offers, for the add-on host operations. A lookup that fails names none, so
// a start operation then refuses.
type EngineBackends struct {
	AppConfig    *config.ApplicationConfig
	Capabilities ClusterCapabilityProvider
	Installed    ClusterInstalledProvider
}

var _ hostops.BackendLister = EngineBackends{}

func (e EngineBackends) FineTune() []string { return e.names("fine-tuning") }

func (e EngineBackends) Quantization() []string { return e.names("quantization") }

func (e EngineBackends) names(tag string) []string {
	// The interface has no request context, so the lookup gets its own bound.
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	infos, err := listTaggedBackends(ctx, e.AppConfig, e.Capabilities, e.Installed, tag)
	if err != nil {
		return nil
	}
	out := make([]string, 0, len(infos))
	for _, i := range infos {
		out = append(out, i.Name)
	}
	return out
}

// FineTuneJobs adapts the fine-tuning service to the add-on host operations.
type FineTuneJobs struct{ Svc *finetune.FineTuneService }

var _ hostops.FineTuner = FineTuneJobs{}

func (f FineTuneJobs) Start(ctx context.Context, userID string, req schema.FineTuneJobRequest) (*schema.FineTuneJobResponse, error) {
	return f.Svc.StartJob(ctx, userID, req)
}

// Get maps every failure to not found: the service has no other answer for a
// job the user does not hold.
func (f FineTuneJobs) Get(userID, jobID string) (*schema.FineTuneJob, error) {
	j, err := f.Svc.GetJob(userID, jobID)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", hostops.ErrNotFound, err)
	}
	return j, nil
}

func (f FineTuneJobs) List(userID string) []*schema.FineTuneJob { return f.Svc.ListJobs(userID) }

func (f FineTuneJobs) Checkpoints(ctx context.Context, userID, jobID string) ([]hostops.Checkpoint, error) {
	if _, err := f.Get(userID, jobID); err != nil {
		return nil, err
	}
	cps, err := f.Svc.ListCheckpoints(ctx, userID, jobID)
	if err != nil {
		return nil, err
	}
	out := make([]hostops.Checkpoint, 0, len(cps))
	for _, cp := range cps {
		out = append(out, hostops.Checkpoint{Step: cp.Step, Path: cp.Path, CreatedAt: cp.CreatedAt})
	}
	return out, nil
}

// QuantizationJobs adapts the quantization service to the add-on host operations.
type QuantizationJobs struct {
	Svc *quantization.QuantizationService
}

var _ hostops.Quantizer = QuantizationJobs{}

func (q QuantizationJobs) Start(ctx context.Context, userID string, req schema.QuantizationJobRequest) (*schema.QuantizationJobResponse, error) {
	return q.Svc.StartJob(ctx, userID, req)
}

// Get maps every failure to not found, as FineTuneJobs.Get does.
func (q QuantizationJobs) Get(userID, jobID string) (*schema.QuantizationJob, error) {
	j, err := q.Svc.GetJob(userID, jobID)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", hostops.ErrNotFound, err)
	}
	return j, nil
}

func (q QuantizationJobs) List(userID string) []*schema.QuantizationJob {
	return q.Svc.ListJobs(userID)
}

// FineTuneProgress adapts the fine-tuning service to the progress and stop
// operations. A job the user does not hold is not found, as in FineTuneJobs.
type FineTuneProgress struct{ Svc *finetune.FineTuneService }

var _ hostops.ProgressSource = FineTuneProgress{}

func (f FineTuneProgress) StreamProgress(ctx context.Context, userID, jobID string, cb func(hostops.Progress)) error {
	return f.Svc.StreamProgress(ctx, userID, jobID, func(ev *schema.FineTuneProgressEvent) {
		cb(hostops.Progress{JobID: ev.JobID, Status: ev.Status, Message: ev.Message, Percent: ev.ProgressPercent})
	})
}

// Snapshot carries no percent: a job keeps none between events.
func (f FineTuneProgress) Snapshot(userID, jobID string) (hostops.Progress, error) {
	j, err := f.Svc.GetJob(userID, jobID)
	if err != nil {
		return hostops.Progress{}, fmt.Errorf("%w: %w", hostops.ErrNotFound, err)
	}
	return hostops.Progress{JobID: j.ID, Status: j.Status, Message: j.Message}, nil
}

func (f FineTuneProgress) StopJob(ctx context.Context, userID, jobID string, saveCheckpoint bool) error {
	return f.Svc.StopJob(ctx, userID, jobID, saveCheckpoint)
}

// QuantizationProgress adapts the quantization service to the progress and
// stop operations. A quantization job keeps no checkpoint, so saveCheckpoint
// is ignored.
type QuantizationProgress struct {
	Svc *quantization.QuantizationService
}

var _ hostops.ProgressSource = QuantizationProgress{}

func (q QuantizationProgress) StreamProgress(ctx context.Context, userID, jobID string, cb func(hostops.Progress)) error {
	return q.Svc.StreamProgress(ctx, userID, jobID, func(ev *schema.QuantizationProgressEvent) {
		cb(hostops.Progress{JobID: ev.JobID, Status: ev.Status, Message: ev.Message, Percent: ev.ProgressPercent})
	})
}

// Snapshot carries no percent: a job keeps none between events.
func (q QuantizationProgress) Snapshot(userID, jobID string) (hostops.Progress, error) {
	j, err := q.Svc.GetJob(userID, jobID)
	if err != nil {
		return hostops.Progress{}, fmt.Errorf("%w: %w", hostops.ErrNotFound, err)
	}
	return hostops.Progress{JobID: j.ID, Status: j.Status, Message: j.Message}, nil
}

func (q QuantizationProgress) StopJob(ctx context.Context, userID, jobID string, _ bool) error {
	return q.Svc.StopJob(ctx, userID, jobID)
}
