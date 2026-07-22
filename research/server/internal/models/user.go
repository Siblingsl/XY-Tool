package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type User struct {
	ID               int64     `gorm:"primaryKey;autoIncrement" json:"id"`
	Username         string    `gorm:"uniqueIndex;size:255;not null" json:"username"`
	PasswordHash     string    `gorm:"column:password_hash;not null" json:"-"`
	TenantID         int64     `gorm:"column:tenant_id;not null" json:"tenantId"`
	Role             string    `gorm:"size:50;default:user" json:"role"`
	Status           string    `gorm:"size:20;default:active" json:"status"`
	RefreshTokenHash string    `gorm:"column:refresh_token_hash;type:text" json:"-"`
	CreatedAt        time.Time `json:"createdAt"`
	UpdatedAt        time.Time `json:"updatedAt"`
}

func (User) TableName() string { return "users" }

type ResearchBase struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID  int64     `gorm:"column:tenant_id;not null;index" json:"tenantId"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (b *ResearchBase) BeforeCreate(tx *gorm.DB) error {
	if b.ID == uuid.Nil {
		b.ID = uuid.New()
	}
	return nil
}
