const BASE_PORT = 8000;
const MAX_PORT = 8100;

class PortManager {
  private static instance: PortManager;
  private usedPorts: Set<number> = new Set();

  private constructor() {}

  static getInstance(): PortManager {
    if (!PortManager.instance) {
      PortManager.instance = new PortManager();
    }
    return PortManager.instance;
  }

  allocate(): number {
    for (let port = BASE_PORT; port <= MAX_PORT; port++) {
      if (!this.usedPorts.has(port)) {
        this.usedPorts.add(port);
        return port;
      }
    }
    throw new Error("No available ports in range");
  }

  release(port: number): void {
    this.usedPorts.delete(port);
  }

  isAvailable(port: number): boolean {
    return !this.usedPorts.has(port) && port >= BASE_PORT && port <= MAX_PORT;
  }

  getUsedPorts(): number[] {
    return Array.from(this.usedPorts).sort((a, b) => a - b);
  }

  reserve(port: number): boolean {
    if (this.isAvailable(port)) {
      this.usedPorts.add(port);
      return true;
    }
    return false;
  }
}

export const portManager = PortManager.getInstance();
