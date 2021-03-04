import {
  IRPCChannelServerSide,
  MessageCallback,
  Message,
} from '@zorpc/core';
import { Middleware, Context } from 'koa';
import { IServerConfig, PassMessage } from './interface';

export class Server implements IRPCChannelServerSide<IServerConfig> {
  private server = {
    consumers: {},
    postMessage(output: Message<any>) {
      this.useCallback(output);
    },
    onmessage(message: Message<any>): void {
      throw new Error(`Server Override onMessage`);
    },
    createCallback<Output>(id: string, consumer: (output: Output) => void, done: Function) {
      this.consumers[id] = (output: Output) => {
        consumer(output);
        // consume only once
        delete this.consumers[id];
      };

      done();
    },
    useCallback(message: Message<any>) {
      const consumeOnlyOnceCallback = this.consumers[message.id];

      if (!consumeOnlyOnceCallback) {
        throw new Error(`CallbackFor(${message.id}) doesnot exist. Maybe it have been consumed ?`)
      }

      consumeOnlyOnceCallback(JSON.stringify(message));
    },
  };

  constructor(public readonly config: IServerConfig) {}

  public postMessage<Output>(output: Message<Output>): void {
    // @LOGGER need a logger: send message to client
    this.server.postMessage(output);
  }

  public onMessage<Input>(callback: MessageCallback<Input>) {
    // override onMessage
    this.server.onmessage = (input: PassMessage<any>) => {
      // @LOGGER need a logger: receive message from client
      callback(null, input);
    };
  }

  public middleware(): Middleware {
    const { method, path } = this.config;
    return async (ctx: Context, next: Function) => {
      // @TODO here, method only support POST
      if (ctx.method === method && ctx.path === path) {
        // @LOGGER need a logger: hit rpc
        const input = (ctx.request as any).body;
        // @TODO should valid message id before use input.id
        return await new Promise<void>((resolve, reject) => {
          this.server.createCallback(
            input.id,
            (output: string) => {
              ctx.status = 200;
              ctx.body = JSON.parse(output);
              resolve();
            },
            () => {
              this.server.onmessage(input);
            },
          );
        });
      }

      await next();
    }
  }
}