// SPDX-License-Identifier: MIT
package application

import (
	"context"
	"fmt"
	"path/filepath"
	"time"

	"github.com/mudler/LocalAI/core/http/auth"
	"github.com/mudler/LocalAI/core/services/addons/builtin"
	"github.com/mudler/LocalAI/core/services/addons/pins"
	"github.com/mudler/LocalAI/core/services/advisorylock"
	"github.com/mudler/xlog"
	"gorm.io/gorm"
)

// addonPinSweepEvery is how often the retention sweep runs.
const addonPinSweepEvery = 6 * time.Hour

// AddonPinStore returns the pin store, creating it once so the routes and the
// retention sweep share it. Creating it also runs the one-time upgrade seed for
// the accounts that exist now. An error is cached: a store that could not be
// opened stays unavailable, and startup must stop rather than fall back to
// memory and lose every unpin at the next restart.
func (a *Application) AddonPinStore() (pins.Store, error) {
	a.addonPinStoreOnce.Do(func() {
		s, err := pinStoreFor(a.authDB, a.applicationConfig.DataPath)
		if err != nil {
			a.addonPinStoreErr = err
			return
		}
		a.addonPinStore = s
		if _, err := s.SeedExisting(context.Background(), a.existingPinAccounts(), pins.SeedIDs); err != nil {
			xlog.Warn("addon pin upgrade seed failed; it will run again at the next start", "error", err)
		}
	})
	return a.addonPinStore, a.addonPinStoreErr
}

// existingPinAccounts are the keys pins are stored under for the accounts that
// exist at this moment: every user of the account database, or the one local
// owner when authentication is off. The local owner counts as an existing
// account, so a deployment with authentication off keeps its Studio and Talk
// entries too.
func (a *Application) existingPinAccounts() []string {
	if a.authDB == nil {
		return []string{auth.AddonLocalOwnerID}
	}
	var ids []string
	if err := a.authDB.Model(&auth.User{}).Pluck("id", &ids).Error; err != nil {
		xlog.Warn("could not list accounts for the pin seed", "error", err)
		return nil
	}
	return ids
}

// pinStoreFor picks the store: the shared account database when there is one,
// otherwise a file next to the other add-on data (one local owner, one host).
func pinStoreFor(db *gorm.DB, dataPath string) (pins.Store, error) {
	if db != nil {
		s, err := pins.NewGormStore(db)
		if err != nil {
			return nil, fmt.Errorf("open the add-on pin table: %w", err)
		}
		return s, nil
	}
	path := ""
	if dataPath != "" {
		path = filepath.Join(dataPath, "addon-pins.json")
	} else {
		xlog.Warn("No data path and no account database: add-on pins are kept in memory only and do not survive a restart")
	}
	s, err := pins.NewFileStore(path)
	if err != nil {
		return nil, fmt.Errorf("open the add-on pins file %q: %w", path, err)
	}
	return s, nil
}

// startAddonPinSweep expires the pins of removed add-ons. With an account
// database one frontend at a time runs it (a leader loop). Without one there
// is one process and a plain ticker runs it.
func (a *Application) startAddonPinSweep(ctx context.Context, store pins.Store) {
	gw := a.addonGateway
	if gw == nil || gw.Manager == nil || store == nil {
		return
	}
	run := func() {
		ids, err := gw.Manager.InstalledIDs(ctx)
		if err != nil {
			return // no answer: a sweep must not change anything
		}
		present := append(ids, builtin.IDs()...)
		if _, err := pins.Sweep(ctx, store, present, time.Now().UTC()); err != nil {
			xlog.Warn("addon pin sweep failed", "error", err)
		}
	}
	if db := a.authDB; db != nil {
		go advisorylock.RunLeaderLoop(ctx, db, advisorylock.KeyAddonPinSweep, addonPinSweepEvery, run)
		return
	}
	go func() {
		t := time.NewTicker(addonPinSweepEvery)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				run()
			}
		}
	}()
}
