// SPDX-License-Identifier: MIT
package routes

import (
	"github.com/labstack/echo/v4"
	"github.com/mudler/LocalAI/core/application"
	endpoints "github.com/mudler/LocalAI/core/http/endpoints/addons"
)

// RegisterAddonNavigationRoutes registers the user-scoped routes of the
// Add-ons drawer: the built-in tiles and, in a later task, the pins. They sit
// outside the addons feature group on purpose, so a user who reaches Studio
// today still reaches it from the drawer. The existing add-on route tests
// describe the routes of RegisterAddonRoutesFor only; these routes have their
// own test and their own API guide (tag AddonNavigation).
func RegisterAddonNavigationRoutes(e *echo.Echo, a *application.Application) {
	e.GET("/api/addons/builtin", endpoints.ListBuiltin(a.AuthDB()))
}
