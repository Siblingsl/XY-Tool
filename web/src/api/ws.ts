type EventHandler = (data: any) => void;

export type WsStatus = 'connecting' | 'connected' | 'disconnected';

type StatusHandler = (status: WsStatus) => void;

class WsClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<EventHandler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private shouldConnect = false;
  private statusHandlers = new Set<StatusHandler>();
  private _status: WsStatus = 'disconnected';

  get status(): WsStatus {
    return this._status;
  }

  private setStatus(s: WsStatus): void {
    if (this._status === s) return;
    this._status = s;
    this.statusHandlers.forEach((h) => {
      try { h(s); } catch { /* ignore */ }
    });
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  private buildUrl(): string | null {
    const token = localStorage.getItem('accessToken');
    if (!token) return null;
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${window.location.host}/api/ws?token=${encodeURIComponent(token)}`;
  }

  connect(): void {
    if (!localStorage.getItem('accessToken')) return;
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) return;
    this.shouldConnect = true;
    this.setStatus('connecting');

    const url = this.buildUrl();
    if (!url) return;

    try {
      this.ws = new WebSocket(url);
    } catch {
      this.setStatus('disconnected');
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.setStatus('connected');
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        const handlers = this.handlers.get(msg.event);
        if (handlers) {
          handlers.forEach((h) => {
            try { h(msg.data); } catch { /* ignore */ }
          });
        }
      } catch { /* ignore parse error */ }
    };

    this.ws.onclose = () => {
      this.ws = null;
      if (this.shouldConnect) {
        this.setStatus('disconnected');
        this.scheduleReconnect();
      } else {
        this.setStatus('disconnected');
      }
    };

    this.ws.onerror = () => {
      try { this.ws?.close(); } catch { /* ignore */ }
    };
  }

  disconnect(): void {
    this.shouldConnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
    this.setStatus('disconnected');
    this.reconnectAttempts = 0;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.shouldConnect) return;
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  off(event: string, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }
}

export const wsClient = new WsClient();
