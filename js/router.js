export class Router {
  constructor() {
    this.routes = {};
    this.currentView = null;
    window.addEventListener('hashchange', () => this.resolve());
  }

  on(path, handler) {
    this.routes[path] = handler;
    return this;
  }

  navigate(path) {
    window.location.hash = path;
  }

  resolve() {
    const hash = window.location.hash.slice(1) || '/';
    const parts = hash.split('/').filter(Boolean);
    const path = '/' + (parts[0] || '');
    const param = parts[1] || null;

    const handler = this.routes[path] || this.routes['/'];
    if (handler) {
      this.currentView = path;
      handler(param);
    }
  }

  start() {
    this.resolve();
  }
}
