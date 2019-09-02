import {
  IRPCChannelServerSide,
  MessageCallback,
  Message,
} from '@zorpc/core';
import { Request, Response, NextFunction, RequestHandler } from 'express';
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

  public middleware(): RequestHandler {
    const { method, path } = this.config;
    return (req: Request, res: Response, next: NextFunction): any => {
      // @TODO here, method only support POST
      if (req.method === method && req.path === path) {
        // @LOGGER need a logger: hit rpc
        const input = req.body;
        return this.server.createCallback(
          input.id,
          (output: string) => {
            res.json(JSON.parse(output));
          },
          () => {
            this.server.onmessage(input);
          },
        );
      }

      next();
    }
  }
}