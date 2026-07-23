package models

import (
	"database/sql/driver"
	"fmt"
	"strings"

	"github.com/google/uuid"
)

// UUIDArray maps to PostgreSQL uuid[].
// Plain []uuid.UUID is serialized by GORM as a composite row ('uuid'), which
// Postgres rejects with: malformed array literal.
type UUIDArray []uuid.UUID

func (UUIDArray) GormDataType() string { return "uuid[]" }

func (a UUIDArray) Value() (driver.Value, error) {
	if a == nil {
		return nil, nil
	}
	if len(a) == 0 {
		return "{}", nil
	}
	var b strings.Builder
	b.WriteByte('{')
	for i, id := range a {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(id.String())
	}
	b.WriteByte('}')
	return b.String(), nil
}

func (a *UUIDArray) Scan(src interface{}) error {
	if src == nil {
		*a = nil
		return nil
	}
	var s string
	switch v := src.(type) {
	case string:
		s = v
	case []byte:
		s = string(v)
	default:
		return fmt.Errorf("UUIDArray: cannot scan type %T", src)
	}
	s = strings.TrimSpace(s)
	if s == "" || s == "{}" {
		*a = UUIDArray{}
		return nil
	}
	if strings.HasPrefix(s, "{") && strings.HasSuffix(s, "}") {
		s = s[1 : len(s)-1]
	}
	if s == "" {
		*a = UUIDArray{}
		return nil
	}
	parts := strings.Split(s, ",")
	out := make(UUIDArray, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		p = strings.Trim(p, `"`)
		if p == "" {
			continue
		}
		id, err := uuid.Parse(p)
		if err != nil {
			return fmt.Errorf("UUIDArray: parse %q: %w", p, err)
		}
		out = append(out, id)
	}
	*a = out
	return nil
}
