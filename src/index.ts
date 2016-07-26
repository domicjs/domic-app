
import {Eventable, resolve, pathget, Atom} from 'carbyne'
import * as Reflect from 'reflect-metadata'


export type Params = {

  [name: string]: any

}

export type ComputedViews = {
  [name: string]: () => Atom
}

export interface Constructor<S extends Service> {
  new(...a: any[]): S
}


/**
 * Application
 */
export class App extends Eventable {

  public activating: boolean = false

  // protected active_partials = new Map<Constructor<Partial>, Partial>()
  // protected activating_partials: Map<Constructor<Partial>, Partial> = null
  // protected currently_activating: Partial[] = []

  /**
   *
   */
  // protected registered_partials: {[name: string]: Constructor<Partial>}

  constructor() {
    super()
    // this.active_partials = new Map<Constructor<Partial>, Partial>()
  }

  block(): Block {
    return new Block(this)
  }

  screen(): Screen {
    return new Screen(this)
  }

  view<A extends Service, B extends Service>(c: Constructor<A>, b: Constructor<B>, fn: (a: A, b: B) => Atom): View;
  view<A extends Service>(c: Constructor<A>, fn: (c: A) => Atom): View;
  view(fn: () => Atom): View;
  view(...a: any[]): View {
    let v = new View(this)
    return v
  }

  /**
   * Get the views as computed from the partials.
   */
  getViews(): ComputedViews {
    let result: ComputedViews = {}

    // this.active_partials.forEach(partial => {
    //   let views = (partial.constructor as typeof Partial).__views__

    //   for (let x in views) {
    //     if (!(x in result)) {
    //       let types = Reflect.getMetadata('design:paramtypes', views, x)
    //       result[x] = views[x].bind(null, partial)
    //     }
    //   }
    // });

    return result
  }

  /**
   *
   */
  go(s: string, params?: Params): Thenable<any>;
  go(s: Screen, params?: Params): Thenable<any>;

  go(p: Screen|string, params?: Params): Thenable<any> {

    this.trigger('change:before')

    this.activating = true
    // this.activating_partials = new Map<Constructor<Partial>, Partial>()

    return null
  }

  ////////////////////////////////////////////////////////////////////////////
  /// DECORATORS
  ////////////////////////////////////////////////////////////////////////////

  /**
   * Registers a partial with its name to be able to call it later on.
   */
  register(p: Screen): void;
  register(name: string): (p: Screen) => void;
  register(p: Screen|string): any {

    if (typeof p === 'string') {
      return (p2: Screen) => {

      }
    } else {
      let name = (p as any).name
      // if (name in this.registered_partials)
      //   throw new Error(`the partial '${name}' is already registered`)
      // this.registered_partials[name] = p
    }

  }

  params(...props: string[]) {
    return function decorate(p: typeof Service) {
      p.__params_check__ = props
    }
  }

}

export var app = new App


/**
 *
 */
export class Service extends Eventable {

  static __params_check__: string[]

  app: App
  params: Params
  __requires__: Array<Service> = []

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

  public require<P extends Service>(p: Constructor<P>): P {
    let part = this.app.service(p, this.params)
    this.__requires__.push(part)
    return part as P
  }

  /**
   * Override this method to tell when this partial needs to be re-inited.
   */
  public needsReinit(params: Params): boolean {

    let chk = (this.constructor as typeof Service).__params_check__

    for (let r of this.__requires__)
      if (r.needsReinit(params)) return true

    if (chk && chk.length) {
      for (let c of chk) {
        if (pathget(params, c) !== pathget(this.params, c))
          return true
      }
    }

    return false
  }

}


export type ViewMap = Map<Block, View>


export class Screen {

  public app: App
  public map: ViewMap

  constructor(app: App, init: ViewMap = null) {
    this.app = app

    if (init !== null)
      this.map = new Map(init) as ViewMap
    else
      this.map = new Map() as ViewMap
  }

  include(def: Screen): Screen {
    return this
  }

  setBlock(v: Block, view: View) {
    return this
  }

}


/**
 *
 */
export class View {

  public app: App
  public deps: Constructor<Service>[]
  public fn: (...a: Service[]) => Atom

  constructor(app: App) {
    this.app = app
  }

}

export class Block {

  public app: App

  constructor(app: App) {
    this.app = app
  }

  /** */
  asAtom(): Atom {
    return null
  }

  view<A extends Service, B extends Service, C extends Service, D extends Service, E extends Service, F extends Service>(a: Constructor<A>, b: Constructor<B>, c: Constructor<C>, d: Constructor<D>, e: Constructor<E>, f: Constructor<F>, fn: (a: A, b: B, c: C, d: D, e: E, f: F) => Atom): View;
  view<A extends Service, B extends Service, C extends Service, D extends Service, E extends Service>(a: Constructor<A>, b: Constructor<B>, c: Constructor<C>, d: Constructor<D>, e: Constructor<E>, fn: (a: A, b: B, c: C, d: D, e: E) => Atom): View;
  view<A extends Service, B extends Service, C extends Service, D extends Service>(a: Constructor<A>, b: Constructor<B>, c: Constructor<C>, d: Constructor<D>, fn: (a: A, b: B, c: C, d: D) => Atom): View;
  view<A extends Service, B extends Service, C extends Service>(a: Constructor<A>, b: Constructor<B>, c: Constructor<C>, fn: (a: A, b: B, c: C) => Atom): View;
  view<A extends Service, B extends Service>(a: Constructor<A>, b: Constructor<B>, fn: (a: A, b: B) => Atom): View;
  view<A extends Service>(a: Constructor<A>, fn: (c: A) => Atom): View;
  view(fn: () => Atom): View;
  view(...a: any[]): View {
    let v = new View(this.app)
    let fn = a[a.length - 1]
    let services = a.slice(0, a.length - 2)
    v.fn = fn
    v.deps = services
    return v
  }

}

export function DisplayBlock(holder: Block): Atom {
  return null
}
