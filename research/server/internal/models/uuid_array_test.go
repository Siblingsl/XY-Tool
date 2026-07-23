package models

import (
	"testing"

	"github.com/google/uuid"
)

func TestUUIDArrayValueScan(t *testing.T) {
	id1 := uuid.MustParse("5942897c-863b-4ce9-8a19-a59c3953b577")
	id2 := uuid.MustParse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")

	v, err := UUIDArray{id1, id2}.Value()
	if err != nil {
		t.Fatal(err)
	}
	want := "{5942897c-863b-4ce9-8a19-a59c3953b577,aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee}"
	if v != want {
		t.Fatalf("Value=%v want %s", v, want)
	}

	empty, err := UUIDArray{}.Value()
	if err != nil || empty != "{}" {
		t.Fatalf("empty Value=%v err=%v", empty, err)
	}

	var a UUIDArray
	if err := a.Scan(want); err != nil {
		t.Fatal(err)
	}
	if len(a) != 2 || a[0] != id1 || a[1] != id2 {
		t.Fatalf("Scan got %#v", a)
	}
	if err := a.Scan("{}"); err != nil || len(a) != 0 {
		t.Fatalf("Scan empty got %#v err=%v", a, err)
	}
	if err := a.Scan(nil); err != nil || a != nil {
		t.Fatalf("Scan nil got %#v err=%v", a, err)
	}
}
