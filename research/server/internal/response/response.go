package response

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type envelope struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data"`
}

func OK(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, envelope{
		Code:    0,
		Message: "ok",
		Data:    data,
	})
}

func Error(c *gin.Context, status int, message string) {
	c.JSON(status, envelope{
		Code:    status,
		Message: message,
		Data:    nil,
	})
}

func Abort(c *gin.Context, status int, message string) {
	Error(c, status, message)
	c.Abort()
}
