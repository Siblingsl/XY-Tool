package models

// ResearchNotification is a tenant-scoped in-app notification.
// user_id is nullable so notifications can be shared at the tenant level.
// ID/TenantID/CreatedAt/UpdatedAt are provided by the embedded ResearchBase.
type ResearchNotification struct {
	ResearchBase
	UserID  *int64  `gorm:"column:user_id;type:bigint" json:"userId"`
	Type    string  `gorm:"column:type;size:30;not null;index" json:"type"`
	Title   string  `gorm:"column:title;size:255;not null" json:"title"`
	Body    string  `gorm:"column:body;type:text" json:"body"`
	RefType string  `gorm:"column:ref_type;size:30" json:"refType"`
	RefID   *string `gorm:"column:ref_id;type:text" json:"refId"`
	Read    bool    `gorm:"column:read;not null;default:false;index" json:"read"`
}

func (ResearchNotification) TableName() string { return "research_notifications" }
