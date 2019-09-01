import { Message, EncodedMessage, MessageError } from './../src/interface';
import {
  RPCServer,
  RPCClient,
  IRPCChannelServerSide,
  IRPCChannelClientSide,
  MessageCallback,
} from '../src';

describe("@zorpc/core", () => {
  const mock = {
    client: {
      sendMessage(message: any) {
        mock.server.receiveMessage(null, message);
      },
      receiveMessage(err: any, message: any): void {
        throw new Error(`Override it`);
      },
    },
    server: {
      sendMessage(message: any) {
        mock.client.receiveMessage(null, message);
      },
      receiveMessage(err: any, message: any): void {
        throw new Error(`Override it`);
      },
    },
  };

  class RPCChannelClient implements IRPCChannelClientSide<any> {
    constructor(public readonly config?: any) {}
    
    public postMessage<Input>(message: Message<Input>) {
      console.log(`client postMessage: ${JSON.stringify(message)}`);
      mock.client.sendMessage(message);
    }

    public onMessage<Output>(callback: MessageCallback<Output>) {
      mock.client.receiveMessage = callback;
    }
  }

  class RPCChannelServer implements IRPCChannelServerSide<any> {
    private server = {
      // consumers: {},
      postMessage(message: EncodedMessage<any>) {
        console.log('consume id: ', message.id);
        // this.useCallback(message);
        mock.server.sendMessage(message);
      },
      onmessage(data: EncodedMessage<any>): void {
        throw new Error(`need rewrite`);
      },
      // createCallback<O>(id: string, consumer: (output: O) => void, done: Function) {
      //   this.consumers[id] = (output: O) => {
      //     consumer(output);
      //     delete this.consumers[id]; // consume only once
      //   };
    
      //   done();
      // },
      // useCallback(data: EncodedMessage<any>) {
      //   const consumeOnlyOnceCallback = this.consumers[data.id];
    
      //   if (!consumeOnlyOnceCallback) {
      //     throw new Error(`CallbackFor(${data.id}) doesnot exist. Maybe it have been consumed ?`);
      //   }
    
      //   consumeOnlyOnceCallback(JSON.stringify(data))
      // },
    };

    constructor(public readonly config?: any) {}

    public postMessage<T>(output: EncodedMessage<T>): void {
      this.server.postMessage(output);
    }

    public onMessage<T>(callback: MessageCallback<T>) {
      this.server.onmessage = (clientMessage: EncodedMessage<any>) => {
        callback(null, clientMessage);
      };
    }

    public middleware() {
      return (input: EncodedMessage<any>) => {
        // mock.receiveMessage = this.server.onmessage;
        this.server.onmessage(input);
        // this.server.createCallback(
        //   input.id,
        //   (output: EncodedMessage<any>) => {
        //     console.log('rpc output: ', output);
        //     socket.emit('rpc', output);
        //   },
        //   () => {
        //     this.server.onmessage(input);
        //   },
        // );
      }
    }
  }

  const crypto = {
    encrypt(text: string) {
      return '~' + text;
    },
    decrypt(text: string) {
      return text.slice(1);
    },
  };

  const channel = {
    client: new RPCChannelClient(),
    server: new RPCChannelServer(),
  };

  const rpc = {
    client: new RPCClient(channel.client, {
      onMessageEncrypt: crypto.encrypt,
      onMessageDecrypt: crypto.decrypt,
    }),
    server: new RPCServer(channel.server, {
      onMessageEncrypt: crypto.encrypt,
      onMessageDecrypt: crypto.decrypt,
    }),
  };

  rpc.server.register('health', async () => {
    return true;
  });

  rpc.server.register<{ left: number, right: number }, number>('add', async (input) => {
    return input.left + input.right;
  });

  rpc.server.prepare().then(() => {
    const virtualServer = {
      use(middleware: Function) {
        // call middleware
        console.log('use call');
        mock.server.receiveMessage = (error: any, message: any) => {
          middleware(message);
        };
      },
      listen() {}
    };

    virtualServer.use(rpc.server.middleware());

    virtualServer.listen();
  }); 

  it('works', async () => {
    await new Promise(resolve => {
      setTimeout(() => {
        console.log('setTimeout run');
  
        rpc.client.connect().then(() => {
          rpc.client.consume('health', null).then((result: string) => {
            expect(result).toBe(true);
            console.log(`consume health service: ${result}`);
          });
      
          rpc.client.consume('add', { left: 1, right: 1 }).then((result: string) => {
            console.log(`consume add service: 1 + 1 = ${result}`);
            expect(result).toBe(2);
            resolve();
          });
        });
      }, 0);
    });
  });

  it('add option onMessageEncrypt/Decrypt', async () => {
    await new Promise(resolve => {
      setTimeout(() => {
        console.log('setTimeout run');
  
        rpc.client.connect().then(() => {
          rpc.client.consume('health', null).then((result: string) => {
            expect(result).toBe(true);
            console.log(`consume health service: ${result}`);
          });
      
          rpc.client.consume('add', { left: 1, right: 1 }).then((result: string) => {
            console.log(`consume add service: 1 + 1 = ${JSON.stringify(result)}`);
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

    await new Promise(resolve => {
      setTimeout(() => {
        console.log('setTimeout run');
  
        rpc.client.connect().then(() => {
          rpc.client.consume('throw.error', null).then((result: string) => {
            console.log(`consume throw.error service: ${JSON.stringify(result)}`);
            expect(result).toEqual({ errcode, errmessage });
            resolve();
          });
        });
      }, 0);
    });   
  });

  it('server channel postMessage error structure, client call onError', async () => {
    await new Promise(resolve => {
      setTimeout(() => {
        rpc.client.connect().then(() => {
          rpc.client.consume('service.notfound', null).then((result: any) => {
            console.log(`consume service.notfound service: ${JSON.stringify(result)}`);
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

    await new Promise(resolve => {
      setTimeout(() => {
        rpc.client.connect().then(() => {
          rpc.client.consume('callback.service', null, (result: any) => {
            console.log(`consume callback.service service: ${JSON.stringify(result)}`);
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
