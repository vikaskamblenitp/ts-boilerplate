class SSE {
  private clients: any[] = [];

  addClient(client: any) {
    this.clients.push(client);
  }

  removeClient(client: any) {
    this.clients = this.clients.filter(c => c !== client);
  }

  send(data: any) {
    this.clients.forEach(client => {
      client.write(`data: ${JSON.stringify(data)}\n\n`);
    });
  }
}

export const sse = new SSE();