package queue

import (
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/siblingsl/xy-tool/research-server/internal/models"
	"gorm.io/gorm"
)

type JobType string

const (
	JobSync      JobType = "sync"
	JobReverify  JobType = "reverify"
	JobRescore   JobType = "rescore"
	JobGenerate  JobType = "generate"
)

type JobPayload struct {
	JobID     uuid.UUID
	TenantID  int64
	ProjectID *uuid.UUID
	Type      JobType
}

type SyncRunner interface {
	SyncEmails(tenantID int64) (int, error)
}

type Worker struct {
	db      *gorm.DB
	syncer  SyncRunner
	jobs    chan JobPayload
}

func NewWorker(db *gorm.DB, syncer SyncRunner) *Worker {
	w := &Worker{
		db:     db,
		syncer: syncer,
		jobs:   make(chan JobPayload, 64),
	}
	go w.run()
	return w
}

func (w *Worker) Enqueue(job JobPayload) {
	select {
	case w.jobs <- job:
	default:
		go func() { w.jobs <- job }()
	}
}

func (w *Worker) run() {
	for payload := range w.jobs {
		w.process(payload)
	}
}

func (w *Worker) process(payload JobPayload) {
	now := time.Now()
	w.db.Model(&models.ResearchPipelineJob{}).Where("id = ?", payload.JobID).Updates(map[string]interface{}{
		"status":     "running",
		"started_at": now,
		"error":      nil,
	})

	var err error
	switch payload.Type {
	case JobSync:
		_, err = w.syncer.SyncEmails(payload.TenantID)
	case JobReverify, JobRescore, JobGenerate:
		// Stub: mark done immediately
		err = nil
	default:
		err = nil
	}

	finished := time.Now()
	updates := map[string]interface{}{
		"finished_at": finished,
	}
	if err != nil {
		msg := err.Error()
		updates["status"] = "failed"
		updates["error"] = msg
		log.Printf("job %s failed: %v", payload.JobID, err)
	} else {
		updates["status"] = "done"
	}

	w.db.Model(&models.ResearchPipelineJob{}).Where("id = ?", payload.JobID).Updates(updates)
}
