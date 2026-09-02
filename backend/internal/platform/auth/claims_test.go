package auth

import (
	"reflect"
	"sort"
	"testing"
)

func TestToIdentity_MergesRealmAndClientRoles(t *testing.T) {
	claims := accessTokenClaims{
		Subject:           "sub-123",
		PreferredUsername: "jdoe",
		Email:             "jdoe@example.com",
		RealmAccess:       roleContainer{Roles: []string{"sophiia-user", "offline_access"}},
		ResourceAccess: map[string]roleContainer{
			"projeto-sophiia-api": {Roles: []string{"sophiia-integration-manager"}},
			"other-client":        {Roles: []string{"should-not-appear"}},
		},
	}

	identity := claims.toIdentity("projeto-sophiia-api")

	if identity.Subject != "sub-123" {
		t.Errorf("Subject = %q", identity.Subject)
	}
	if identity.Username != "jdoe" {
		t.Errorf("Username = %q", identity.Username)
	}
	if identity.Email != "jdoe@example.com" {
		t.Errorf("Email = %q", identity.Email)
	}

	got := append([]string{}, identity.Roles...)
	sort.Strings(got)
	want := []string{"sophiia-user", "offline_access", "sophiia-integration-manager"}
	sort.Strings(want)
	if !reflect.DeepEqual(got, want) {
		t.Errorf("Roles = %v, want %v", got, want)
	}
}

func TestToIdentity_DeduplicatesRoles(t *testing.T) {
	claims := accessTokenClaims{
		RealmAccess: roleContainer{Roles: []string{"sophiia-user", "sophiia-user"}},
		ResourceAccess: map[string]roleContainer{
			"api": {Roles: []string{"sophiia-user"}},
		},
	}

	identity := claims.toIdentity("api")

	if len(identity.Roles) != 1 {
		t.Errorf("expected deduplicated roles, got %v", identity.Roles)
	}
}

func TestToIdentity_UnknownClientIDYieldsRealmRolesOnly(t *testing.T) {
	claims := accessTokenClaims{
		RealmAccess: roleContainer{Roles: []string{"sophiia-user"}},
		ResourceAccess: map[string]roleContainer{
			"some-other-client": {Roles: []string{"sophiia-admin"}},
		},
	}

	identity := claims.toIdentity("projeto-sophiia-api")

	if !reflect.DeepEqual(identity.Roles, []string{"sophiia-user"}) {
		t.Errorf("Roles = %v, want [sophiia-user]", identity.Roles)
	}
}
