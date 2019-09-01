import {
  IRPCServer,
  IRPCOptions,
  IRPCChannelServerSide,
  EncodedMessage,
  DecodedMessage,
  MessageError,
  PromiseServiceHandler,
  CallbackServiceHandler,
  ServiceHandlerCallback,
} from './interface';

const HEALTH_SERVICE = 'health';

export class RPCServer<Config> implements IRPCServer<Config> {
  private services: Record<string, CallbackServiceHandler<any, any>> = {};

  constructor(
    private readonly channel: IRPCChannelServerSide<Config>,
    private readonly options: IRPCOptions = {},
  ) {}

  /**
   * Register a Service
   * 
   * @param service service name
   * @param handler service handler
   */
  public register<Input, Output>(service: string, handler: PromiseServiceHandler<Input, Output>): void
  public register<Input, Output>(service: string, handler: CallbackServiceHandler<Input, Output>): void
  public register<Input, Output>(service: string, handler: any) {
    if (handler.length <= 1) {
      this.services[service] = async (input: Input, callback: ServiceHandlerCallback<Output>) => {
        try {
          callback(null, await handler(input));
        } catch (error) {
          error.errcode = 500;
          error.errmessage = '';
          callback(error, error);
        }
      };
      return ;
    }

    this.services[service] = async (input: Input, callback: ServiceHandlerCallback<Output>) => {
      handler(input, callback);
    };
  }

  /**
   * Discover a service
   * 
   * @param service service name
   * @returns service handler
   */
  public discover(service: string): CallbackServiceHandler<any, any> {
    const handler = this.services[service];
    if (!handler) {
      const serviceNotFoundMessage = new Error(`Invalid Service: ${service}`) as MessageError;
      serviceNotFoundMessage.errcode = 4000001;
      throw serviceNotFoundMessage;
    }

    return handler;
  }

  /**
   * Consume a message
   * 
   * @param message client transfer message
   */
  public consume<T>(message: DecodedMessage<T>) {
    const { service, body: input } = message.data;
    try {
      const serviceHandler = this.discover(service) as <Input, Output>(input: Input, callback: ServiceHandlerCallback<Output>) => void;

      serviceHandler(input, (error, output) => {
        if (error) {
          return this.onError(error, message);
        }

        const serverMessage = this.createMessage(message, output);
        this.channel.postMessage(serverMessage);
      });
    } catch (error) {
      // const serviceNotFoundMessage = this.createMessage(message, {
      //   errcode: 400001,
      //   errmessage: error.message,
      // });

      // return this.channel.postMessage(serviceNotFoundMessage);
      // const error = new Error() as MessageError;
      // error.errcode = 400001;
      // error.errmessage = 'service Not ';
      this.onError(error, message);
    }
  }

  /**
   * Prepare server
   */
  public async prepare() {
    // 1 set health service
    this.registerHealthService();

    // 2 mount message listener
    this.mountMessageListener();

    // log start
    console.log(`RPC server start`);

    // prepare done, and return config
    return this.channel.config;
  }

  /**
   * Delegate Channel.middleware
   */
  public middleware() {
    if (typeof this.channel.middleware === 'undefined') {
      throw new Error(`Need Channel Realize middleware first!`);
    }

    return this.channel.middleware();
  }

  private mountMessageListener() {
    this.channel.onMessage<any>((error, rawClientMessage) => {
      const clientMessage = this.parseMessage(rawClientMessage);

      if (error) {
        return this.onError(error, clientMessage);
      }

      this.consume(clientMessage);
    });
  }

  /**
   * Register Health Service
   */
  private registerHealthService() {
    this.register(HEALTH_SERVICE, async () => true);
  }

  /**
   * 
   * @param id message id, using client message id
   * @param service service name, using client message service
   * @param body ouput body
   */
  private createMessage<Output>(clientMessage: DecodedMessage<any>, body: Output) {
    const rawServerMessage = {
      id: clientMessage.id,
      timestamps: Date.now(),
      data: {
        service: clientMessage.data.service,
        body,
      },
    };

    const serverMessage = this.encodeMessage(rawServerMessage);

    return serverMessage;
  }

  private parseMessage<T>(rawClientMessage: EncodedMessage<any>) {
    const clientMessage = this.decodeMessage<T>(rawClientMessage);
    return clientMessage;
  }

  private onError<T>(error: MessageError, clientMessage: DecodedMessage<T>) {
    const { errcode = 500, errmessage, message } = error;

    const serverErrorMessage = this.createMessage(clientMessage, {
      errcode,
      errmessage: errmessage || message,
    });

    // send to client
    this.channel.postMessage(serverErrorMessage);
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