
import {
  d,
  o,
  O,
  VirtualHolder,
  NodeCreatorFn,
  Instantiator
} from 'domic'


/**
 *
 */
export class ServiceConfig {
  service: Instantiator<Service>
  params: any[] = []

  constructor(service: Instantiator<Service>, ...params: any[]) {
    this.service = service
    this.params = params
  }
}


/**
 *
 */
class Redirect extends Error {

  screen: Screen
  configs: ServiceConfig[]

  constructor(screen: Screen, configs: ServiceConfig[]) {
    super('redirecting')
    this.screen = screen
    this.configs = configs
  }

}


export type ConfigMap = Map<Instantiator<Service>, ServiceConfig>
export type ServiceMap = Map<Instantiator<Service>, Service>


/**
 * Resolver helps in service instanciation and destroy
 */
export class Resolver {

  services: ServiceMap
  configs: ConfigMap

  old_resolver: Resolver | null
  app: App

  constructor(app: App) {
    this.app = app
  }

  /**
   *
   */
  require<S extends Service>(type: Instantiator<S>): S {

    let service = this.services.get(type) as S

    if (service) return service

    let conf = this.configs.get(type)
    if (conf) {
      // we ignore previous service, since we are being given a new
      // configuration for it.
      service = new type(this.app, ...conf.params)
    } else {
      // try to get an older version of the service since possibly its
      // configuration has not changed.
      service = this.old_resolver ? this.old_resolver.services.get(type) as S : null
      conf = this.old_resolver ? this.old_resolver.configs.get(type) : null

      if (service) {
        // browse the dependencies and check that they haven't changed themselves.
        // if require() sends a different instance of the dependency, this service
        // is not reused.
        for (let d of service._dependencies) {
          let nd = this.require((d as any).constructor)
          if (d !== nd)
            service = null
        }
      }

      if (!service) {
        // no config, no previously instanciated service, so
        // we just create one without arguments, reusing its config if it had one previously.
        let params = conf ? conf.params : []
        service = new type(this.app, ...params)
      }

      // pull the old configuration into the new map to keep track of it.
      if (conf) this.configs.set(type, conf)
    }

    this.services.set(type, service)

    return service
  }

  addScreens(screens: Screen[]) {

  }

  /**
   * Destroy services that won't be used anymore, remove configs of
   * services that are gone from the services.
   */
  commit(): void {

    // Destroy old service versions.
    this.old_resolver.services.forEach((serv, type) => {
      if (this.services.get(type) !== serv) {
        serv._destroy()
      }
    })

    // free the old resolver so it can be garbage collected.
    this.old_resolver = null
  }

  init(): Promise<any> {
    let promises: Thenable<any>[] = []

    this.services.forEach(serv => {
      // Setup the promise chain ; basically, getInitPromise gets all the dependencies promises
      // and will make their init() method wait on them.
      promises.push(serv.getInitPromise(serv._dependencies.map(d => d.getInitPromise())))
    })

    return Promise.all(promises)
  }

  /**
   * Prepare the resolver for a new transition.
   */
  prepare(
    screen: Screen,
    old_resolver: Resolver,
    configs: ServiceConfig[]
  ): void {
    // Setup the config map
    this.configs = new Map() as ConfigMap
    this.services = new Map() as ServiceMap

    configs.forEach(conf => this.configs.set(conf.service, conf))
    screen.deps.forEach(dep => this.require(dep))
  }

}


/**
 * Application
 */
export class App {

  public activating = false

  public current_screen: Screen = null
  public resolver: Resolver = new Resolver(this)
  public services: Map<Instantiator<Service>, Service>
  public config: Map<Instantiator<Service>, ServiceConfig>

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

    if (this.activating)
      // Should do some kind of redirect here ?
      return Promise.reject(new Redirect(screen, configs))

    try {
      this.activating = true

      let prev_resolver = this.resolver
      this.resolver = new Resolver(this)

      this.resolver.prepare(screen, prev_resolver, configs)

      // wait on all the promises before transitionning to a new state.
      return this.resolver.init().then(res => {
        this.resolver.commit()
        this.config = this.resolver.configs
        this.services = this.resolver.services

        this.current_screen = screen as Screen
        this.activating = false

        this.trigger('change')

      }).catch(err => {
        // cancel activation.

        this.resolver = prev_resolver
        this.activating = false

        if (err instanceof Redirect)
          return this.go(err.screen, ...err.configs)

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
  require<S extends Service>(type: Instantiator<S>): S {
    return this.resolver.require(type)
  }

}

/**
 * A sample app, usable by default
 */
export const app = new App


/**
 *
 */
export class Service {

  app: App
  ondestroy: (() => any)[] = []

  _dependencies: Array<Service> = []
  protected _initPromise: Thenable<any>

  constructor(app: App) {
    this.app = app
  }

  static with<Z, A, B, C, D, E, F>(this: new (app: App, a: A, b: B, c: C, d: D, e: E, f: F) => Z, a: A, b: B, c: C, d: D, e: E, f: F): ServiceConfig;
  static with<Z, A, B, C, D, E>(this: new (app: App, a: A, b: B, c: C, d: D, e: E) => Z, a: A, b: B, c: C, d: D, e: E): ServiceConfig;
  static with<Z, A, B, C, D>(this: new (app: App, a: A, b: B, c: C, d: D) => Z, a: A, b: B, c: C, d: D): ServiceConfig;
  static with<Z, A, B, C>(this: new (app: App, a: A, b: B, c: C) => Z, a: A, b: B, c: C): ServiceConfig;
  static with<Z, A, B>(this: new (app: App, a: A, b: B) => Z, a: A, b: B): ServiceConfig;
  static with<Z, A>(this: new (app: App, a: A) => Z, a: A): ServiceConfig;
  static with(...a: any[]) {
    return new ServiceConfig(this, ...a)
  }

  /**
   * This is where async
   */
  public init(...a: any[]): any {
    return null
  }

  public getInitPromise(deps?: any[]): Thenable<any> {
    if (!this._initPromise)
      this._initPromise = Promise.all(deps).then(() => this.init())
    return Promise.resolve(this._initPromise)
  }

  /**
   * Require another service and put it into the list of dependencies.
   */
  public require<S extends Service>(p: Instantiator<S>): S {
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
    let unreg = (o.observe as any)(...params)
    this.ondestroy.push(unreg)
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

  _destroy() {
    for (let d of this.ondestroy) d()
    this.destroy()
  }

  /**
   * Called when destroying this Service.
   * It is meant to be overridden.
   */
  public destroy() {

  }

}


/**
 *
 */
export class Screen {

  public app: App
  public map = new Map<Block, View>()
  public deps = new Set<Instantiator<Service>>()

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
  public deps: Instantiator<Service>[]
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
export class DisplayBlockAtom extends VirtualHolder {

  name: 'block'

  app: App
  block: Block

  current_view: View
  current_deps: Set<Service>

  constructor(block: Block) {
    super()
    this.app = block.app
    this.block = block

    this.app.on('change', () => {
      this.update()
    })
  }

  update() {
    // FIXME : check if the view has had changes in services or if
    // the view object has changed.
    let view = this.app.current_screen ?
      this.app.current_screen.map.get(this.block)
      : null

    if (!view) {
      this.empty()
      return
    }

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
    // this.empty().then(() => {
    //   this.append(res)
    // }, e => console.error(e))
  }

}

/**
 * Display a Block into the Tree
 */
export function DisplayBlock(holder: Block): Node {
  return new DisplayBlockAtom(holder)
}
