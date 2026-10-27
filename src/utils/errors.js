export function handle(socket, action) {
  return (payload = {}) => {
    try {
      action(payload);
    } catch (error) {
      socket.emit('game:error', error instanceof Error ? error.message : 'Não foi possível executar a ação.');
    }
  };
}
