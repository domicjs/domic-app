
import {Eventable, resolve, pathget, Atom} from 'carbyne'

export class Views<P extends Partial> {

  [name: string]: (part: P) => Atom

}


export type Params = {

  [name: string]: any

}

export interface Constructor<P extends Partial> {
  new(...a: any[]): P
}

/**
 * Application
 */
export class App extends Eventable {

  protected active_partials: Map<Constructor<Partial>, Partial>
  protected next_partials: Map<Constructor<Partial>, Partial> = null

  protected registered_partials: {[name: string]: Constructor<Partial>}

  constructor() {
    super()
    this.active_partials = new Map<Constructor<Partial>, Partial>()
  }

  /**
   *
   */
  part(partial: Constructor<Partial>) {

    let part = this.active_partials.get(partial)

    if (part.needsReinit(this.params)) {
      part = new partial(this)
    }

    // Update the next partials with the one we resolved.
    this.next_partials.set(partial, part)

    return part
  }

  /**
   * Registers a partial with its name to be able to call it later on.
   */
  register(p: Constructor<Partial>): void;
  register(name: string): (p: Constructor<Partial>) => void;

  register(p: Constructor<Partial>|string): any {

    if (typeof p === 'string') {
      return (p2: Constructor<Partial>) => {
        this.registered_partials[p] = p2
      }
    } else {
      let name = (p as any).name
      if (name in this.registered_partials)
        throw new Error(`the partial '${name}' is already registered`)
      this.registered_partials[name] = p
    }

  }

  views(V: typeof Views) {
    return (p: typeof Partial) => {
      p.__views__ = new V
    }
  }

  params(...props: string[]) {
    return function decorate(p: typeof Partial) {
      p.__params_check__ = props
    }
  }

  /**
   *
   */
  go(p: string, params?: Params): Thenable<Partial>;
  go(p: Constructor<Partial>, params?: Params): Thenable<Partial>;

  go(p: Constructor<Partial>|string, params?: Params): Thenable<Partial> {

    this.trigger('change:before')

    return null
  }

}

export var app = new App


export class Partial extends Eventable {

  static __params_check__: string[]
  static __views__: Views<Partial>

  app: App
  params: Params

  constructor(app: App, params: Params) {
    super()
    this.app = app
    this.params = params
  }

  /**
   * This is where other states are requested.
   */
  public init(): Thenable<any> {
    return null
  }

  /**
   * Override this method to tell when this partial needs to be re-inited.
   */
  public needsReinit(params: Params): boolean {

    let chk = (this.constructor as typeof Partial).__params_check__

    if (chk && chk.length) {
      for (let c of chk) {
        if (pathget(params, c) !== pathget(this.params, c))
          return true
      }
    }

    return false
  }

}
