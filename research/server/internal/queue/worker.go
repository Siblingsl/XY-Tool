package queue

import (
	"context"
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
	JobRunSkills JobType = "run_skills"
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

// SkillRunner 技能执行接口
type SkillRunner interface {
	RunForTenant(ctx context.Context, tenantID int64) int
}

type Worker struct {
	db          *gorm.DB
	syncer      SyncRunner
	skillRunner SkillRunner
	jobs        chan JobPayload
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

func (w *Worker) SetSkillRunner(sr SkillRunner) {
	w.skillRunner = sr
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
		// sync 完成后自动执行技能
		if err == nil && w.skillRunner != nil {
			skillCount := w.skillRunner.RunForTenant(context.Background(), payload.TenantID)
			log.Printf("skills executed for %d emails (tenant %d)", skillCount, payload.TenantID)
		}
	case JobRunSkills:
		if w.skillRunner != nil {
			w.skillRunner.RunForTenant(context.Background(), payload.TenantID)
		}
	// JobReverify / JobRescore / JobGenerate are implemented inline in their
	// handlers (real DB writes + automation events); the worker only records
	// the job lifecycle here so the jobs view stays accurate.
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
