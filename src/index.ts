
import {Eventable, pathget, Atom, VirtualAtom} from 'carbyne'

export type Params = {

  [name: string]: any

}

export interface Constructor<S extends Service> {
  new(...a: any[]): S
}


/**
 * Application
 */
export class App extends Eventable {

  public activating = false

  public current_screen: Screen = null
  public current_services = new Map<Constructor<Service>, Service>()

  private future_services = new Map<Constructor<Service>, Service>()

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

    var block: Block = function _block(...a: any[]): View {
      let v = new View(this)
      let fn = a[a.length - 1]
      let services = a.slice(0, a.length - 1)
      v.fn = fn
      v.deps = services
      v.block = block
      v.app = block.app
      return v
    } as Block

    block.app = this

    return block
    // return new Block(this)
  }

  screen(name: string, ...views: View[]): Screen {
    let screen = new Screen(this)
    screen.define(...views)
    return screen
  }

  /**
   *
   */
  go(s: string, params?: Params): Thenable<any>;
  go(s: Screen, params?: Params): Thenable<any>;
  go(screen: Screen|string, params?: Params): Thenable<any> {

    if (this.activating)
      // Should do some kind of redirect here ?
      throw new Error(`...`)

    this.trigger('change:before')

    if (typeof screen === 'string') {
      screen = new Screen(this) // ????
    }

    this.activating = true

    this.future_services = new Map<Constructor<Service>, Service>()
    this.computeDependencies(screen as Screen, params)

    // FIXME : initialize the services that were not initialised before.

    this.current_screen = screen as Screen
    this.current_services = this.future_services
    this.future_services = null
    this.activating = false

    this.trigger('change')

    return null
  }

  /**
   *
   */
  service(type: Constructor<Service>, params: Params): Service {
    let service = this.future_services.get(type)

    if (!service) {
      // first, try to figure out if the service can be reused.
      let old_serv = this.current_services.get(type)
      if (old_serv && !old_serv.needsReinit(params))
        // we can reuse the service
        service = old_serv
      else {
        // we need to instanciate it
        service = new type(this)
      }

      this.future_services.set(type, service)
    }

    return service
  }

  /**
   * Fill up the future dependencies and try to init them.
   */
  protected computeDependencies(newscreen: Screen, params: Params) {

    // For all the services, trigger the reinstancing of the ones who have changed.
    newscreen.deps.forEach(type => {
      // for init of services. Will reinstanciate thos that are not valid
      // for the new parameters.
      this.service(type, params)
    })

  }

  ////////////////////////////////////////////////////////////////////////////
  /// DECORATORS
  ////////////////////////////////////////////////////////////////////////////

  // params(...props: string[]) {
  //   return function decorate(p: typeof Service) {
  //     p.__params_check__ = props
  //   }
  // }

}

/**
 * A sample app, usable by default
 */
export var app = new App


/**
 *
 */
export class Service extends Eventable {

  app: App
  params: Params
  _dependencies: Array<Service> = []
  _param_names: string[] = []

  constructor(app: App, params: Params) {
    super()
    this.app = app
    this.params = params
  }

  /**
   * This is where other states are requested.
   */
  public init(...a: any[]): Thenable<any> {
    return null
  }

  /**
   * Require another service and put it into the list of dependencies.
   */
  public require<S extends Service>(p: Constructor<S>): S {
    let serv = this.app.service(p, this.params)
    this._dependencies.push(serv)
    return serv as S
  }

  /**
   * Override this method to tell when this partial needs to be re-inited.
   */
  public needsReinit(params: Params): boolean {

    for (let r of this._dependencies)
      if (r.needsReinit(params)) return true

    let chk = this._param_names
    if (chk && chk.length) {
      for (let c of chk) {
        if (pathget(params, c) !== pathget(this.params, c))
          return true
      }
    }

    return false
  }

  /**
   * Called when destroying this Service.
   * It is meant to be overridden.
   */
  public onDestroy() {

  }

  /**
   * Called whenever this service stays alive but sees the parameters
   * changing.
   */
  public onParamChange(params: Params) {

  }

}


/**
 *
 */
export class Screen {

  public app: App
  public map = new Map<Block, View>()
  public deps = new Set<Constructor<Service>>()

  constructor(app: App) {
    this.app = app
  }

  include(def: Screen): Screen {
    def.map.forEach((view, block) => {
      if (!this.map.has(block))
        // include never overwrites blocks we would already have.
        this.setBlock(block, view)
    })
    return this
  }

  extend(name: string, ...views: View[]): Screen {
    let s = new Screen(this.app)
    s.include(this)
    s.define(...views)
    return s
  }

  define(...views: View[]): Screen {
    views.forEach(view => this.setBlock(view.block, view))
    return this
  }

  protected setBlock(block: Block, view: View) {
    this.map.set(block, view)
    view.deps.forEach(dep => this.deps.add(dep))
    return this
  }

}


/**
 * A view is a render function with Service dependencies that are resolved
 * every time the application changes Screen.
 */
export class View {

  public app: App
  public deps: Constructor<Service>[]
  public fn: (...a: Service[]) => Atom
  public block: Block

  constructor(app: App) {
    this.app = app
  }

}


/**
 *
 */
export type Block = {
  <A extends Service, B extends Service, C extends Service, D extends Service, E extends Service, F extends Service>(a: new (...a: any[]) => A, b: new (...a: any[]) => B, c: new (...a: any[]) => C, d: new (...a: any[]) => D, e: new (...a: any[]) => E, f: new (...a: any[]) => F, fn: (a: A, b: B, c: C, d: D, e: E, f: F) => Atom): View;
  <A extends Service, B extends Service, C extends Service, D extends Service, E extends Service>(a: new (...a: any[]) => A, b: new (...a: any[]) => B, c: new (...a: any[]) => C, d: new (...a: any[]) => D, e: new (...a: any[]) => E, fn: (a: A, b: B, c: C, d: D, e: E) => Atom): View;
  <A extends Service, B extends Service, C extends Service, D extends Service>(a: new (...a: any[]) => A, b: new (...a: any[]) => B, c: new (...a: any[]) => C, d: new (...a: any[]) => D, fn: (a: A, b: B, c: C, d: D) => Atom): View;
  <A extends Service, B extends Service, C extends Service>(a: new (...a: any[]) => A, b: new (...a: any[]) => B, c: new (...a: any[]) => C, fn: (a: A, b: B, c: C) => Atom): View;
  <A extends Service, B extends Service>(a: new (...a: any[]) => A, b: new (...a: any[]) => B, fn: (a: A, b: B) => Atom): View;
  <A extends Service>(a: new (...a: any[]) => A, fn: (c: A) => Atom): View;
  (fn: () => Atom): View;

  app: App
  // should work since this is a function
  name?: string
}


/**
 *
 */
export class DisplayBlockAtom extends VirtualAtom {

  app: App
  block: Block

  current_view: View

  constructor(block: Block) {
    super(`Block <${block.name}>`)
    this.app = block.app
    this.block = block

    this.app.on('change', () => {
      this.update()
    })
    this.update()
  }

  update() {
    // FIXME : check if the view has had changes in services or if
    // the view object has changed.
    let view = this.app.current_screen.map.get(this.block)

    let dep_changed = true // compute if dependency changed.

    if (view === this.current_view && !dep_changed)
      return

    let deps = view.deps.map(cons => this.app.current_services.get(cons))
    let res = view.fn.apply(null, deps)

    this.current_view = view

    this.empty().then(() => {
      this.append(res)
    }, e => console.error(e))
  }

}

/**
 * Display a Block into the Tree
 */
export function DisplayBlock(holder: Block): Atom {
  return new DisplayBlockAtom(holder)
}
