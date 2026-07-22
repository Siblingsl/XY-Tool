package models

type ResearchGmailAccount struct {
	ResearchBase
	Email           string  `gorm:"size:255;not null" json:"email"`
	RefreshTokenEnc string  `gorm:"column:refresh_token_enc;type:text;not null" json:"-"` // TODO: encrypt at rest with RESEARCH_TOKEN_KEY
	SyncCursor      *string `gorm:"column:sync_cursor;size:255" json:"syncCursor,omitempty"`
	Status          string  `gorm:"size:20;default:active" json:"status"`
}

func (ResearchGmailAccount) TableName() string { return "research_gmail_accounts" }
