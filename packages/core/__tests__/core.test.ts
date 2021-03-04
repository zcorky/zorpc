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
      // receiveMessage(err: any, message: any): void {
      //   throw new Error(`Override it`);
      // },
      receiveMessages: {},
    },
    server: {
      sendMessage(message: any) {
        mock.client.receiveMessages[message.id](null, message);
      },
      receiveMessage(err: any, message: any): void {
        throw new Error(`Override it`);
      },
    },
  };

  interface Config {
    
  }

  class RPCChannelClient implements IRPCChannelClientSide<Config> {
    private receiveMessage: MessageCallback<any>;
    private sendMessage: (input: EncodedMessage<any>) => Promise<EncodedMessage<any>>;
    constructor(public readonly config?: Config) {}
    
    public postMessage<Input>(clientMessage: Message<Input>) {
      // console.log(`client postMessage: ${JSON.stringify(clientMessage)}`);
      // mock.client.sendMessage(clientMessage);
      this.sendMessage(clientMessage)
        .then(serverMessage => {
          this.receiveMessage(null, serverMessage);
        })
        .catch(error => {
          this.receiveMessage(error, clientMessage);
        });
    }

    public onMessage<Output>(callback: MessageCallback<Output>) {
      // mock.client.receiveMessage = callback;
      this.receiveMessage = (error, message) => {
        // console.log('client onMessage: ', error, message);
        callback(error, message);
      };
    }

    public useEngine(callback: (config: Config, message: EncodedMessage<any>) => Promise<EncodedMessage<any>>): void {
      this.sendMessage = (input: EncodedMessage<any>) => {
        return callback(this.config, input);
      };
    }
  }

  class RPCChannelServer implements IRPCChannelServerSide<any> {
    private server = {
      // consumers: {},
      postMessage(message: EncodedMessage<any>) {
        // console.log('server postMessage: ', message);
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

  channel.client.useEngine((config, clientMessage) => {
    return new Promise((resolve, reject) => {
      // create listen before is better
      const message = clientMessage;
      mock.client.receiveMessages[message.id] = (error: any, message: any) => {
        if (error) {
          return reject(error);
        }
        
        return resolve(message);
      }

      mock.client.sendMessage(clientMessage);
    });
  });

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
        // console.log('use call');
        mock.server.receiveMessage = (error: any, message: any) => {
          // console.log('server onMessage: ', message);
          middleware(message);
        };
      },
      listen() {}
    };

    virtualServer.use(rpc.server.middleware());

    virtualServer.listen();
  }); 

  it('works', async () => {
    await new Promise<void>(resolve => {
      setTimeout(() => {
        // console.log('setTimeout run');
        rpc.client.connect().then(() => {
          rpc.client.consume('health', null).then((result: string) => {
            expect(result).toBe(true);
            // console.log(`consume health service: ${result}`);
          });
      
          // console.log('consume add service: 1 + 1');
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
          rpc.client.consume('throw.error', null).then((result: string) => {
            // console.log(`consume throw.error service: ${JSON.stringify(result)}`);
            // expect(result).toEqual({ errcode, errmessage });
            // resolve();
          }).catch(error => {
            expect(error.errcode).toEqual(errcode);
            expect(error.errmessage).toEqual(errmessage);
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
          rpc.client.consume('service.notfound', null).catch((error: any) => {
            // console.log(`consume service.notfound service: ${JSON.stringify(result)}`);
            expect(error.errcode).not.toBeUndefined();
            expect(error.errmessage).not.toBeUndefined();
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

  it(`client onMessgae Encrypt error will cause break`, async () => {
    const crypto = {
      encrypt(text: string) {
        // console.log(`client onMessgae Encrypt error`);
        throw new Error(`crypto.encrypt throw a error`);
        // return '~' + text;
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
  
    channel.client.useEngine((config, clientMessage) => {
      return new Promise((resolve, reject) => {
        // create listen before is better
        const message = clientMessage;
        mock.client.receiveMessages[message.id] = (error: any, message: any) => {
          if (error) {
            return reject(error);
          }
          
          return resolve(message);
        }
  
        mock.client.sendMessage(clientMessage);
      });
    });
  
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
          // console.log('use call');
          mock.server.receiveMessage = (error: any, message: any) => {
            // console.log('server onMessage: ', message);
            middleware(message);
          };
        },
        listen() {}
      };
  
      virtualServer.use(rpc.server.middleware());
  
      virtualServer.listen();
    }); 
    
    await new Promise<void>(resolve => {
      setTimeout(() => {
        rpc.client.connect().then(() => {
          // rpc.client.consume('callback.service', null, (result: any) => {
          //   expect(result).toBe('good');
          //   resolve();
          // });
        }).catch(error => {
          expect(error.message).toBe('crypto.encrypt throw a error');
          resolve();
        });
      }, 0);
    }); 
  });

  it(`server onMessgae Decrypt error will cause break`, async () => {
    const crypto = {
      encrypt(text: string) {
        return '~' + text;
      },
      decrypt(text: string) {
        // console.log(`message: `, text);
        // console.log(`server onMessgae Decrypt error`);
        throw new Error(`crypto.decrypt throw a error`);
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
  
    channel.client.useEngine((config, clientMessage) => {
      return new Promise((resolve, reject) => {
        // create listen before is better
        const message = clientMessage;
        mock.client.receiveMessages[message.id] = (error: any, message: any) => {
          if (error) {
            return reject(error);
          }
          
          return resolve(message);
        }
  
        mock.client.sendMessage(clientMessage);
      });
    });
  
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
          // console.log('use call');
          mock.server.receiveMessage = (error: any, message: any) => {
            // console.log('server onMessage: ', message);
            middleware(message);
          };
        },
        listen() {}
      };
  
      virtualServer.use(rpc.server.middleware());
  
      virtualServer.listen();
    }); 
    
    await new Promise<void>(resolve => {
      setTimeout(() => {
        rpc.client.connect().then(() => {
          // rpc.client.consume('callback.service', null, (result: any) => {
          //   expect(result).toBe('good');
          //   resolve();
          // });
        }).catch(error => {
          expect(error.message).toBe('crypto.decrypt throw a error');
          resolve();
        });
      }, 0);
    }); 
  });
});
