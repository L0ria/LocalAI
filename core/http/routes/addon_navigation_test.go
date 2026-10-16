// SPDX-License-Identifier: MIT
//go:build auth

package routes_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"

	"github.com/labstack/echo/v4"
	"github.com/mudler/LocalAI/core/application"
	"github.com/mudler/LocalAI/core/config"
	"github.com/mudler/LocalAI/core/http/auth"
	"github.com/mudler/LocalAI/core/http/routes"
	"github.com/mudler/LocalAI/pkg/addons/contract"
	"github.com/mudler/LocalAI/pkg/system"
	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
)

const navSecret = "addon-navigation-secret"

var _ = Describe("Add-on navigation routes with real authentication", func() {
	var (
		e     *echo.Echo
		app   *application.Application
		token string
	)
	BeforeEach(func() {
		dir := GinkgoT().TempDir()
		models, backends := filepath.Join(dir, "models"), filepath.Join(dir, "backends")
		Expect(os.Mkdir(models, 0750)).To(Succeed())
		Expect(os.Mkdir(backends, 0750)).To(Succeed())
		state, err := system.GetSystemState(system.WithBackendPath(backends), system.WithModelPath(models))
		Expect(err).NotTo(HaveOccurred())
		ctx, cancel := context.WithCancel(context.Background())
		DeferCleanup(cancel)
		app, err = application.New(config.WithContext(ctx), config.WithSystemState(state), config.WithAuthEnabled(true), config.WithAuthDatabaseURL(":memory:"), config.WithAuthAPIKeyHMACSecret(navSecret))
		Expect(err).NotTo(HaveOccurred())
		gdb := app.AuthDB()
		// A member with no permission row and no addons grant.
		Expect(gdb.Create(&auth.User{ID: "member", Email: "member@example.test", Name: "member", Provider: auth.ProviderLocal, Role: auth.RoleUser, Status: auth.StatusActive}).Error).To(Succeed())
		token, _, err = auth.CreateAPIKey(gdb, "member", "test", auth.RoleUser, navSecret, nil)
		Expect(err).NotTo(HaveOccurred())
		e = echo.New()
		e.Use(auth.Middleware(gdb, app.ApplicationConfig()))
		// The order of app.go: the feature group first, then the navigation routes.
		routes.RegisterAddonRoutes(e, app)
		routes.RegisterAddonNavigationRoutes(e, app)
	})
	get := func(path string, withKey bool) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodGet, path, nil)
		if withKey {
			r.Header.Set("Authorization", "Bearer "+token)
		}
		w := httptest.NewRecorder()
		e.ServeHTTP(w, r)
		return w
	}

	It("lists studio and talk for a member who lacks the addons feature", func() {
		w := get("/api/addons/builtin", true)
		Expect(w.Code).To(Equal(http.StatusOK), w.Body.String())
		var body struct {
			Builtin []struct {
				ID string `json:"id"`
			} `json:"builtin"`
		}
		Expect(json.Unmarshal(w.Body.Bytes(), &body)).To(Succeed())
		var ids []string
		for _, b := range body.Builtin {
			ids = append(ids, b.ID)
		}
		Expect(ids).To(Equal([]string{"studio", "talk"}))
	})
	It("keeps the addons feature gate on the group and the static route unshadowed", func() {
		Expect(get("/api/addons/apps", true).Code).To(Equal(http.StatusForbidden))
		Expect(get("/api/addons/builtin", true).Code).To(Equal(http.StatusOK))
	})
	It("refuses an anonymous caller", func() {
		Expect(get("/api/addons/builtin", false).Code).To(Equal(http.StatusUnauthorized))
	})
	It("reserves every first path segment the navigation routes register", func() {
		nav := echo.New()
		routes.RegisterAddonNavigationRoutes(nav, app)
		Expect(nav.Routes()).NotTo(BeEmpty())
		for _, r := range nav.Routes() {
			rest, ok := strings.CutPrefix(r.Path, "/api/addons/")
			if !ok {
				continue
			}
			first, _, _ := strings.Cut(rest, "/")
			Expect(contract.ReservedAddonID(first)).To(BeTrue(), r.Method+" "+r.Path)
		}
	})
})
