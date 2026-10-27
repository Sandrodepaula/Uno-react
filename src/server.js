import { createSocketServer } from './config/socket.js';
import { createGameService } from './services/gameService.js';
import { registerSocketEvents } from './sockets/index.js';

const { httpServer, io } = await createSocketServer();
const gameService = createGameService(io);

registerSocketEvents(io, gameService);

const port = Number(process.env.PORT) || 3000;
httpServer.listen(port, '0.0.0.0', () => {
  console.log(`UNO disponível em http://localhost:${port}`);
});
