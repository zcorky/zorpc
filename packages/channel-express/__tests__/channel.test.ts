import { parse } from 'url';
import * as express from 'express';
import * as bodyParser from 'body-parser';
import { RPCServer, RPCClient, MessageError } from '@zorpc/core';
// import fetch from 'isomorphic-fetch';
import * as request from 'supertest';
// import * as pkg from '@zorpc/core/package.json';
// const VERSION = pkg && pkg.version || '0.0.1';

import { Client as RPCChannelClient, Server as RPCChannelServer } from '../src';

const app = express();
app.use((req, res, next) => {
  // console.log('request: ', req.path, req.body);
  next();
});
const fetch = (url: string, options: RequestInit) => {
  const path = parse(url).path;
  // return request(app)[options.method.toLowerCase()](path);
  return new Promise<{ json: () => Promise<any>}>((resolve, reject) => {
    // console.log(`supertest: `, path, options);
    request(app)
      .post(path)
      .set(options.headers)
      // .set('Accept', 'accept')
      .send(JSON.parse(options.body as any as string))
      .expect(200)
      .end((error, res) => {
        // console.log(`supertest done: `, path, options);
        if (error) return reject(error);
        return resolve({
          json: async () => res.body,
        });
      });
  });
}

describe("@zorpc/channel-express", () => {
  const crypto = {
    encrypt(text: string) {
      return '~' + text;
    },
    decrypt(text: string) {
      return text.slice(1);
    },
  };

  // beforeEach(() => {
  //   app = new Express();
  // });

  // afterEach(() => {
  //   app.resetMocked();
  // });

  const channel = {
    config: {
      protocol: 'http',
      host: '127.0.0.1',
      port: 10999,
      path: '/zorpc',
      method: 'POST',
    },
    createClient() {
      return new RPCChannelClient(this.config);
    },
    createServer() {
      return new RPCChannelServer(this.config);
    },
  };

  const channels = {
    client: channel.createClient(),
    server: channel.createServer(),
  };

  // private async request<Input, Output>(body: PassMessage<Input>): Promise<Message<Output>> {
  //   const { protocol, host, port, path, headers } = this.config;
    
  //   const url = `${protocol}://${host}:${port}${path}`;
  //   const method = 'POST';
  //   const finalHeaders = {
  //     ...headers,
  //     'Content-Type': 'application/json',
  //     'User-Agent': `Simple-RPC-Client/v${VERSION}`,
  //   };

  //   return fetch(url, {
  //     method,
  //     headers: finalHeaders,
  //     body: JSON.stringify(body),
  //   }).then(res => res.json());
  // }

  channels.client.useEngine((config, message) => {
    const { protocol, host, port, path, method, headers } = config;
    const url = `${protocol}://${host}:${port}${path}`;
    const finalHeaders = {
      ...headers,
      'Content-Type': 'application/json',
      // 'User-Agent': `Simple-RPC-Client/v${VERSION}`,
    };
    // console.log('client engine run: ', config, message);
    return fetch(url, { method, headers: finalHeaders, body: JSON.stringify(message) }).then(res => res.json());
  });

  const rpc = {
    client: new RPCClient(channels.client, {
      // onMessageEncrypt: crypto.encrypt,
      // onMessageDecrypt: crypto.decrypt,
    }),
    server: new RPCServer(channels.server, {
      // onMessageEncrypt: crypto.encrypt,
      // onMessageDecrypt: crypto.decrypt,
    }),
  };

  rpc.server.register('health', async () => {
    return true;
  });

  rpc.server.register<{ left: number, right: number }, number>('add', async (input) => {
    return input.left + input.right;
  });

  rpc.server.prepare().then((config) => {
    // console.log('[server] prepare done');
    app.get('/health', (req, res, next) => {
      res.sendStatus(200);
    });
    app.use((req, res, next) => {
      // console.log('request 2: ', req.path, req.body);
      next();
    });
    app.use(bodyParser.json());
    // app.use(bodyParser.urlencoded({ extended: false }));
    app.use((req, res, next) => {
      // console.log('request 3: ', req.path, req.body);
      next();
    });
    app.use(rpc.server.middleware());

    // app.listen(config.port, config.host, () => {
    //   console.log('Express server start at ' + config.port);
    // });
  }); 

  it('works', async () => {
    await new Promise<void>(resolve => {
      setTimeout(() => {
        // console.log('setTimeout run');
  
        rpc.client.connect().then(() => {
          // console.log(`rpc connected`);

          // resolve();

          rpc.client.consume('health', null).then((result: string) => {
            expect(result).toBe(true);
            // console.log(`consume health service: ${result}`);
          });
      
          rpc.client.consume('add', { left: 1, right: 1 }).then((result: string) => {
            // console.log(`consume add service: 1 + 1 = ${result}`);
            expect(result).toBe(2);
            resolve();
          });
        });
      }, 0);
    });
  });

  it('add option onMessageEncrypt/Decrypt', async () => {
    await new Promise<void>(resolve => {
      setTimeout(() => {
        // console.log('setTimeout run');
  
        rpc.client.connect().then(() => {
          rpc.client.consume('health', null).then((result: string) => {
            expect(result).toBe(true);
            // console.log(`consume health service: ${result}`);
          });
      
          rpc.client.consume('add', { left: 1, right: 1 }).then((result: string) => {
            // console.log(`consume add service: 1 + 1 = ${JSON.stringify(result)}`);
            expect(result).toBe(2);
            resolve();
          });
        });
      }, 0);
    });
  });

  it('service throw error, server call onError', async () => {
    const errcode = 500;
    const errmessage = 'service throw error';
    rpc.server.register('throw.error', () => {
      const error = new Error(errmessage) as MessageError;
      error.errcode = errcode;
      error.errmessage = errmessage;
      throw error;
    });

    await new Promise<void>(resolve => {
      setTimeout(() => {
        // console.log('setTimeout run');
  
        rpc.client.connect().then(() => {
          rpc.client.consume('throw.error', null).then((response) => {
            console.log(`throw.error response: `, response);
          }).catch((result: MessageError) => {
            // console.log(`consume throw.error service: ${JSON.stringify(result)}`);
            // expect(result).toEqual({ errcode, errmessage });
            expect(result.errcode).toEqual(errcode);
            expect(result.errmessage).toEqual(errmessage);
            resolve();
          });
        });
      }, 0);
    });   
  });

  it('server channel postMessage error structure, client call onError', async () => {
    await new Promise<void>(resolve => {
      setTimeout(() => {
        rpc.client.connect().then(() => {
          rpc.client.consume('service.notfound', null).catch((result: any) => {
            // console.log(`consume service.notfound service: ${JSON.stringify(result)}`);
            expect(result.errcode).not.toBeUndefined();
            expect(result.errmessage).not.toBeUndefined();
            resolve();
          });
        });
      }, 0);
    }); 
  });

  it('server register callback service, client consume with callback', async () => {
    rpc.server.register<string, string>('callback.service', (input, callback) => {
      callback(null, 'good');
    });

    await new Promise<void>(resolve => {
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
