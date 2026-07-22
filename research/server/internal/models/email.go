package models

import (
	"time"

	"github.com/lib/pq"
	"gorm.io/datatypes"
)

type ResearchEmail struct {
	ResearchBase
	GmailMessageID string         `gorm:"column:gmail_message_id;size:255;not null;uniqueIndex" json:"gmailMessageId"`
	Subject        string         `gorm:"type:text;not null" json:"subject"`
	FromAddr       string         `gorm:"column:from_addr;size:500;not null" json:"fromAddr"`
	ReceivedAt     time.Time      `gorm:"column:received_at;not null" json:"receivedAt"`
	BodyText       *string        `gorm:"column:body_text;type:text" json:"bodyText"`
	ExtractedJSON  datatypes.JSON `gorm:"column:extracted_json;type:jsonb" json:"extractedJson"`
	Categories     pq.StringArray `gorm:"column:categories;type:text[]" json:"categories"`
	Status         string         `gorm:"size:30;default:pending;index" json:"status"`
	FilterReason   *string        `gorm:"column:filter_reason;size:255" json:"filterReason"`
}

func (ResearchEmail) TableName() string { return "research_emails" }
