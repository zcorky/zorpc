import { RPCServer, RPCClient, MessageError } from '@zorpc/core';

import * as http from 'http';
import * as WsServer from 'socket.io';
import * as WsClient from 'socket.io-client';


import { Client as RPCChannelClient, Server as RPCChannelServer, Connection, IClientConfig } from '../src';
import { AddressInfo } from 'net';
import { IServerConfig } from '../../channel-koa/src';

describe("@zorpc/channel-socket.io", () => {
  let rpc: { client: RPCClient<any>, server: RPCServer<any> };

  let httpServer: http.Server;
  let httpServerAddr: AddressInfo;
  let wsServer: WsServer.Server;
  let wsClient: SocketIOClient.Socket;

  beforeAll(done => {
    httpServer = http.createServer();
    wsServer = WsServer(httpServer);
    httpServer.listen(17777, '127.0.0.1', () => {
      httpServerAddr = httpServer.address() as any as AddressInfo;
      console.log(`server listen at: `, httpServerAddr);
      done();
    });

    // rpc
    const factory = {
      config: {
        protocol: 'http',
        host: '127.0.0.1', // httpServerAddr.address,
        port: 17777, // httpServerAddr.port,
        event: 'zorpc',
      },
      createClient() {
        return new RPCChannelClient(this.config);
      },
      createServer() {
        return new RPCChannelServer(this.config);
      },
    };

    const channels = {
      client: factory.createClient(),
      server: factory.createServer(),
    };
  
    // channels.client.useEngine((config, message) => {
    //   return new Promise((resolve, reject) => {
    //     const { protocol, host, port, event } = config;
    //     const url = `${protocol}://${host}:${port}`;
    //     console.log(`send message: `, message);

    //     const handler = (message) => {
    //       console.log(`receive message: `, message);
    //       wsClient.off(event, handler);
    //       wsClient.off('error', reject);
    //       resolve(message);
    //     };
  
    //     wsClient.on(event, handler);
    //     wsClient.on('error', reject);
  
    //     wsClient.emit(event, message);
    //   });
    // });
  
    // channels.client.useSocket({
    //   emit(event: string, ...args: any[]) {
    //     wsClient.emit(event, ...args);
    //   },
    //   on(event: string, fn: Function) {
    //     wsClient.on(event, fn);
    //   },
    // } as any);

    rpc = {
      client: new RPCClient(channels.client),
      server: new RPCServer(channels.server),
    };

    rpc.server.register('add', async ({ left, right }) => {
      return left + right;
    });
  
    rpc.server.prepare().then(config => {
      wsServer.on('connection', (socket) => {
        console.log(`socket(${socket.id}) enter`);
  
        socket.on('disconnect', () => {
          console.log(`socket(${socket.id}) leave`);
        });

        socket.on(config.event, (message) => {
          // console.log(`${config.event}: `, message);
        });
      });
  
      console.log(`prepare rpc done`);
      wsServer.use(rpc.server.middleware());
    });
  });

  afterAll(done => {
    wsServer.close();
    httpServer.close();
    done();
  });

  beforeEach(done => {
    wsClient = WsClient.connect(`http://${httpServerAddr.address}:${httpServerAddr.port}`, {
      reconnectionDelay: 0,
      transports: ['websocket'],
    });

    wsClient.on('connect', () => {
      done();
    });
  });

  afterEach(done => {
    // Cleanup
    if (wsClient.connected) {
      wsClient.disconnect();
    }

    done();
  });


  it('works', async () => {
    await new Promise(resolve => {
      setTimeout(() => {
        // console.log('setTimeout run');
  
        rpc.client.connect().then(() => {
          // console.log(`rpc connected`);

          // resolve();

          let count = 0;
          const counter = () => {
            count++;

            if (count === 2) {
              resolve();
            }
          }

          rpc.client.consume('health', null).then((result: string) => {
            expect(result).toBe(true);
            // console.log(`consume health service: ${result}`);
          });
      
          rpc.client.consume('add', { left: 1, right: 1 }).then((result: string) => {
            // console.log(`consume add service: 1 + 1 = ${result}`);
            expect(result).toBe(2);
            counter();
          });

          rpc.client.consume('add', { left: 2, right: 2 }).then((result: string) => {
            // console.log(`consume add service: 1 + 1 = ${result}`);
            expect(result).toBe(4);
            counter();
          });
        });
      }, 0);
    });
  });

  it('server register callback service, client consume with callback', async () => {
    rpc.server.register<string, string>('callback.service', (input, callback) => {
      callback(null, 'good');
    });

    await new Promise(resolve => {
      setTimeout(() => {
        rpc.client.connect().then(() => {
          rpc.client.consume('callback.service', null, (result: any) => {
            // console.log(`consume callback.service service: ${JSON.stringify(result)}`);
            // expect(result.errcode).not.toBeUndefined();
            // expect(result.errmessage).not.toBeUndefined();
            expect(result).toBe('good');
            resolve();
          });
        });
      }, 0);
    }); 
  });
});
