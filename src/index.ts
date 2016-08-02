
import {o, O, Eventable, Atom, VirtualAtom, Observable, Observer, DependentObservable, CarbyneListener} from 'carbyne'


export interface Constructor<S extends Service> {
  new(...a: any[]): S
}


export class ServiceConfig {
  service: Constructor<Service>
  params: any[] = []

  constructor(service: Constructor<Service>, ...params: any[]) {
    this.service = service
    this.params = params
  }
}


/**
 * Resolver helps in service instanciation and destroy
 */
export class Resolver {

  services: Map<Constructor<Service>, Service>
  future_services: Map<Constructor<Service>, Service>
  configs: Map<Constructor<Service>, ServiceConfig> = new Map<Constructor<Service>, ServiceConfig>()
  future_configs: Map<Constructor<Service>, ServiceConfig>
  app: App

  constructor(app: App) {
    this.app = app
  }

  /**
   *
   */
  require<S extends Service>(type: Constructor<S>): S {
    let service = this.future_services.get(type) as S

    if (!service) {
      let conf = this.future_configs.get(type)
      if (conf) {
        // we ignore previous service, since we are being given a new
        // configuration for him.
        service = new type(this.app, ...conf.params)
      } else {
        service = this.services.get(type) as S
        if (!service) {
          // no config, no previously instanciated service, so
          // we just create one without arguments.
          service = new type(this.app)
        }
      }

      this.future_services.set(type, service)
    }

    return service
  }

  /**
   * Destroy services that won't be used anymore, remove configs of
   * services that are gone from the services.
   */
  commit(): void {

    // merge future_configs into configs
    this.future_configs.forEach((conf, type) => {
      this.configs.set(type, conf)
    })

    // remove services that don't exist in the new ones from all_config
    // so that this.all_config represents the current global configuration.
    let gone_services = new Set<Constructor<Service>>()
    this.configs.forEach((conf, type) => {
      if (!this.future_services.has(type))
        gone_services.add(type)
    })

    gone_services.forEach(type => this.configs.delete(type))
    this.services.forEach((serv, type) => {
      if (!this.future_services.has(type))
        serv.destroy()
    })

    this.services = this.future_services
    this.future_services = new Map<Constructor<Service>, Service>()
  }

  /**
   * Cancel the change.
   */
  rollback(): void {
    this.future_services = new Map<Constructor<Service>, Service>()
    this.future_configs = new Map<Constructor<Service>, ServiceConfig>()
  }

  /**
   * Prepare the resolver for a new transition.
   */
  prepare(services: Map<Constructor<Service>, Service>, ...configs: ServiceConfig[]): void {
    // Setup the config map
    this.future_configs = new Map<Constructor<Service>, ServiceConfig>()
    configs.forEach(conf => this.future_configs.set(conf.service, conf))

    // Only keep the services for which we know there won't be a
    // reinit.
    this.services = new Map<Constructor<Service>, Service>()
    if (services) {
      services.forEach((service, type) => {
        if (!this.future_configs.has(type))
          this.services.set(type, service)
      })
    }

    // Prepare the future services.
    this.future_services = new Map<Constructor<Service>, Service>()
  }

}


/**
 * Application
 */
export class App extends Eventable {

  public activating = false

  public current_screen: Screen = null
  public resolver: Resolver = new Resolver(this)
  public services: Map<Constructor<Service>, Service>
  public config: Map<Constructor<Service>, ServiceConfig>

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
  go(screen: Screen, ...configs: ServiceConfig[]): Thenable<any> {

    try {

      if (this.activating)
        // Should do some kind of redirect here ?
        throw new Error(`...`)

      this.trigger('change:before')

      this.activating = true

      let prev_resolver = this.resolver

      this.resolver = new Resolver(this)
      this.resolver.prepare(this.services, ...configs)

      screen.deps.forEach(type => this.resolver.require(type))

      let promises: Thenable<any>[] = []
      this.resolver.future_services.forEach(serv => {
        if (serv.initPromise) promises.push(serv.initPromise)
      })

      // wait on all the promises before transitionning to a new state.
      return Promise.all(promises).then(res => {
        this.resolver.commit()
        this.config = this.resolver.configs
        this.services = this.resolver.services

        this.current_screen = screen as Screen
        this.activating = false

        this.trigger('change')

      }).catch(err => {
        // cancel activation.
        this.resolver.rollback()
        this.resolver = prev_resolver
        this.activating = false
        return Promise.reject(err)
      })
    } catch (err) {
      this.activating = false
      return Promise.reject(err)
    }

  }

  /**
   *
   */
  require<S extends Service>(type: Constructor<S>): S {
    return this.resolver.require(type)
  }

  on(evt: string, fn: CarbyneListener<this>) {
    if (evt === 'change')
      fn(this._mkEvent('change'))
    return super.on(evt, fn)
  }

}

/**
 * A sample app, usable by default
 */
export const app = new App


/**
 *
 */
export class Service extends Eventable {

  app: App
  initPromise: Thenable<any>
  _dependencies: Array<Service> = []

  constructor(app: App) {
    super()
    this.app = app
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
    let serv = this.app.require(p)
    this._dependencies.push(serv)
    return serv as S
  }

  public observe<A, B, C, D, E, F>(a: O<A>, b: O<B>, c: O<C>, d: O<D>, e: O<E>, f: O<F>, cbk: (a: A, b: B, c: C, d: D, e: E, f: F) => any): this;
  public observe<A, B, C, D, E>(a: O<A>, b: O<B>, c: O<C>, d: O<D>, e: O<E>, cbk: (a: A, b: B, c: C, d: D, e: E) => any): this;
  public observe<A, B, C, D>(a: O<A>, b: O<B>, c: O<C>, d: O<D>, cbk: (a: A, b: B, c: C, d: D) => any): this;
  public observe<A, B, C>(a: O<A>, b: O<B>, c: O<C>, cbk: (a: A, b: B, c: C) => any): this;
  public observe<A, B>(a: O<A>, b: O<B>, cbk: (a: A, b: B) => any): this;
  public observe<A>(a: O<A>, cbk: (a: A, prop?: string) => any): this;
  public observe(...params: any[]): this {
    this.on('destroy', (o.observe as any)(...params))
    return this
  }

  /**
   * Override this method to tell when this partial needs to be re-inited.
   */
  public needsReinit(): boolean {

    for (let r of this._dependencies)
      if (r.needsReinit()) return true

    return false
  }

  /**
   * Called when destroying this Service.
   * It is meant to be overridden.
   */
  public destroy() {
    this.trigger('destroy')
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
  current_deps: Set<Service>

  constructor(block: Block) {
    super(`Block <${block.name}>`)
    this.app = block.app
    this.block = block

    this.app.on('change', () => {
      this.update()
    })
  }

  update() {
    // FIXME : check if the view has had changes in services or if
    // the view object has changed.
    let view = this.app.current_screen.map.get(this.block)
    let deps = view.deps.map(cons => this.app.services.get(cons))
    let newdeps = new Set<Service>(deps)

    let dep_changed = !this.current_deps // compute if dependency changed.

    if (this.current_deps) {
      for (let d of deps) {
        if (!this.current_deps.has(d)) {
          dep_changed = true
          break
        }
      }
    }

    if (!view)
      throw new Error('no such view')

    if (view === this.current_view && !dep_changed)
      return

    this.current_view = view
    this.current_deps = newdeps

    let res = view.fn.apply(null, deps)

    // FIXME won't work if changing too fast.
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
