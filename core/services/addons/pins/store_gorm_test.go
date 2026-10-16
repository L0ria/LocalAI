//go:build auth

// SPDX-License-Identifier: MIT
package pins

import (
	"testing"

	"github.com/mudler/LocalAI/core/http/auth"
)

// The test of two frontends over one database uses Service, which Task 3 adds;
// it lives in Task 3 (service_gorm_test.go).
func TestGormStoreContract(t *testing.T) {
	runStoreContract(t, func(t *testing.T) Store {
		db, err := auth.InitDB(":memory:")
		if err != nil {
			t.Fatal(err)
		}
		s, err := NewGormStore(db)
		if err != nil {
			t.Fatal(err)
		}
		return s
	})
}
