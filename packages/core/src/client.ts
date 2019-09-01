import { uuid } from '@zodash/uuid';
import {
  IRPCClient,
  IRPCOptions,
  IRPCChannelClientSide,
  MessageError,
  DecodedMessage,
  EncodedMessage,
} from './interface';

const HEALTH_SERVICE = 'health';

export class RPCClient<Config> implements IRPCClient<Config> {
  private isHealthy: boolean = false;
  private consumers: Record<string, (output: any) => void> = {};

  constructor(
    private readonly channel: IRPCChannelClientSide<Config>,
    private readonly options: IRPCOptions = {},
  ) {
    
  }

  public async connect() {  
    // 1 mount listener
    this.mountMessageListener();

    // 2 consume health service
    this.isHealthy = await this.consume(HEALTH_SERVICE, null);
    if (!this.isHealthy) {
      throw new Error(`Connect Serveice Center Failed ! Please Check and Try again.`);
    }
  }

  public consume<Input, Output>(service: string, input: Input): Promise<Output>
  public consume<Input, Output>(service: string, input: Input, callback: (output: Output) => void): void
  public consume<Input, Output>(service: any, input: Input, callback?: any): any {
    if (!this.isHealthy && service !== HEALTH_SERVICE) {
      throw new Error(`Service Center is not ready. Please Connect first or Check what's wrong ?`);
    }

    const message = this.createMessage(service, input);

    // console.log('current consumers: ', Object.keys(this.consumers).length, Object.keys(this.consumers));
    
    if (typeof callback === 'function') {
      this.createCallback<any>(message.id, callback, () => {
        this.channel.postMessage(message);
      });
      return ;
    }

    return new Promise<Output>((resolve) => {
      this.createCallback<any>(
        message.id,
        (output: Output) => {
          resolve(output);
        }, () => {
          this.channel.postMessage(message);
        },
      );
    });
  }

  private mountMessageListener() {
    this.channel.onMessage((error, rawServerMessage) => {
      // parse message
      const serverMessage = this.parseMessage(rawServerMessage);

      if (error) {
        return this.onError(error, serverMessage);
      }

      // call callback
      this.useCallback(serverMessage);
    });
  }

  private createCallback<O>(id: string, consumeOutput: (output: O) => void, done: Function) {
    this.consumers[id] = (output: O) => {
      consumeOutput(output);
      delete this.consumers[id]; // consume only once
    };

    done();
  }

  private useCallback(message: DecodedMessage<any>) {
    const consumeOutputOnlyOnceCallback = this.consumers[message.id];

    if (!consumeOutputOnlyOnceCallback) {
      throw new Error(`CallbackFor(${message.data.service}_${message.id}) doesnot exist. Maybe it have been consumed ?`);
    }

    consumeOutputOnlyOnceCallback(message.data.body)
  }

  private createMessage<Input>(service: string, body: Input) {
    const id = uuid();
    const rawClientMessage = {
      id,
      timestamps: Date.now(),
      data: {
        service,
        body,
      },
    };

    const clientMessage = this.encodeMessage(rawClientMessage);
    return clientMessage;
  }

  private parseMessage(rawServerMessage: EncodedMessage<any>) {
    const serverMessage = this.decodeMessage(rawServerMessage);
    return serverMessage;
  }

  private onError<T>(error: MessageError, serverMessage: DecodedMessage<T>) {
    const { errcode = 500, errmessage, message } = error;
    const { service } = serverMessage.data;

    const serverErrorMessage = this.createMessage(service, {
      errcode,
      errmessage: errmessage || message,
    });

    // consume in callback
    this.useCallback(serverErrorMessage);
  }

  public encodeMessage<Visible>(message: DecodedMessage<Visible>): EncodedMessage<any> {
    let encodedMessage = message as any as EncodedMessage<string>;

    if (this.options.onMessageEncrypt) {
      const strified = JSON.stringify(message.data);

      encodedMessage = {
        id: message.id,
        timestamps: message.timestamps,
        data: this.options.onMessageEncrypt(strified),
      };
    }

    return encodedMessage;
  }

  public decodeMessage<Visible>(message: EncodedMessage<any>): DecodedMessage<Visible> {
    let decodedMessage = message as any as DecodedMessage<Visible>;

    if (this.options.onMessageDecrypt) {
      const strigified = this.options.onMessageDecrypt(message.data);
      
      decodedMessage = {
        id: message.id,
        timestamps: message.timestamps,
        data: JSON.parse(strigified),
      };
    }

    return decodedMessage;
  }
}