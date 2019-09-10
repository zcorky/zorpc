import * as http from 'http';
import * as WsServer from 'socket.io';
import * as rpc from '@zorpc/core';
import * as channels from '@zorpc/channel-socket.io';
import * as fetch from 'node-fetch';
import { encrypt, decrypt } from '@zodash/crypto/lib/aes';

const rpcChannel = new channels.Server({
  protocol: 'http',
  host: '127.0.0.1',
  port: 18080,
  event: 'zorpc',
  appKey: '666',
});

const rpcServer = new rpc.RPCServer(rpcChannel, {
  onMessageDecrypt(message: string) {
    return decrypt('aes-256-cfb', '15681121457910001568112145791000', '1568112115681121', message);
  },
  onMessageEncrypt(message: string) {
    return encrypt('aes-256-cfb', '15681121457910001568112145791000', '1568112115681121', message);
  },
});

rpcServer.register('github', async (name: string) => {
  return fetch(`https://api.github.com/users/${name}`).then(res => res.json());
});

rpcServer
  .prepare()
  .then(config => {
    const httpServer = http.createServer();
    const wsServer = WsServer(httpServer);

    httpServer.listen(config.port, config.host, () => {
      console.log(`server start at: ${config.host}:${config.port}`);
    });

    wsServer.on('connect', socket => {
      console.log(`client(${socket.id}) connected`);

      socket.on('disconnect', () => {
        console.log(`client(${socket.id}) disconnected`);
      });

      socket.on(config.event, (message) => {
        console.log(`receive ${config.event}: `, message);
      });
    });

    wsServer.use(rpcServer.middleware());
  });
