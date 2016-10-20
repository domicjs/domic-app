
import {
  d,
  o,
  onrender,
  O,
  Observable,
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
   *  For a given service type, return an instance, creating it
   *  if it doesn't exist, using a matching ServiceConfig if provided.
   *
   *  If this is not the first time the service is instanciated, try
   *  to reuse a previous instance as long as its config or any of its
   *  dependencies have not changed.
   *
   *  @param type: A Service type
   *  @returns: The matching service instance
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

  /**
   * Destroy services that won't be used anymore by calling their destroy()
   * method.
   */
  commit(): void {

    // Destroy old service versions.
    if (this.old_resolver) {
      this.old_resolver.services.forEach((serv, type) => {
        if (this.services.get(type) !== serv) {
          serv.destroy()
        }
      })
    }

    // free the old resolver so it can be garbage collected.
    this.old_resolver = null
  }

  /**
   * Call all the init() of the services.
   *
   * @returns: A promise of when the initiation will be done.
   */
  init(): Promise<any> {
    let promises: Promise<any>[] = []

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

  public o_services: Observable<ServiceMap> = o(null)

  block(name: string): Block {

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
    block._name = name

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
  go(screen: Screen, ...configs: ServiceConfig[]): Promise<any> {

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

        this.o_services.set(this.services)

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
  protected _initPromise: Promise<any>

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
   * Overload this method to perform your service initiation. You can
   * return a Promise to indicate that the service may initialize itself
   * asynchronously -- it may for instance perform network requests.
   *
   * If this service used require() for another service, then init() will
   * only be called once the dependencies' init() have been resolved.
   */
  public init(): any {
    return null
  }

  /**
   *
   */
  public getInitPromise(deps?: any[]): Promise<any> {
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

  destroy() {
    for (let d of this.ondestroy) d()
    this.onDestroy()
  }

  /**
   * Called when destroying this Service.
   * It is meant to be overridden.
   */
  public onDestroy() {

  }

}


/**
 *
 */
export class Screen {

  public app: App
  public blocks = new Map<Block, View>()
  public deps = new Set<Instantiator<Service>>()

  constructor(app: App) {
    this.app = app
  }

  include(def: Screen): Screen {
    def.blocks.forEach((view, block) => {
      if (!this.blocks.has(block))
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
    this.blocks.set(block, view)
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
  public fn: (...a: Service[]) => Node
  public block: Block

  constructor(app: App) {
    this.app = app
  }

}


/**
 *
 */
export type Block = {
  <A extends Service, B extends Service, C extends Service, D extends Service, E extends Service, F extends Service>(a: Instantiator<A>, b: Instantiator<B>, c: Instantiator<C>, d: Instantiator<D>, e: Instantiator<E>, f: Instantiator<F>, fn: (a: A, b: B, c: C, d: D, e: E, f: F) => Node): View;
  <A extends Service, B extends Service, C extends Service, D extends Service, E extends Service>(a: Instantiator<A>, b: Instantiator<B>, c: Instantiator<C>, d: Instantiator<D>, e: Instantiator<E>, fn: (a: A, b: B, c: C, d: D, e: E) => Node): View;
  <A extends Service, B extends Service, C extends Service, D extends Service>(a: Instantiator<A>, b: Instantiator<B>, c: Instantiator<C>, d: Instantiator<D>, fn: (a: A, b: B, c: C, d: D) => Node): View;
  <A extends Service, B extends Service, C extends Service>(a: Instantiator<A>, b: Instantiator<B>, c: Instantiator<C>, fn: (a: A, b: B, c: C) => Node): View;
  <A extends Service, B extends Service>(a: Instantiator<A>, b: Instantiator<B>, fn: (a: A, b: B) => Node): View;
  <A extends Service>(a: Instantiator<A>, fn: (c: A) => Node): View;
  (fn: () => Node): View;

  app: App
  _name?: string
}


/**
 *
 */
export class DisplayBlockAtom extends VirtualHolder {

  attrs: {
    block: Block
  }

  current_view: View
  current_deps: Set<Service>

  render() {
    this.observe(this.attrs.block.app.o_services, services => {
      if (!app.current_screen) return
      this.update(app)
    })

    this.name = `block ${this.attrs.block._name}`

    return super.render()
  }


  update(app: App): void {
    // FIXME : check if the view has had changes in services or if
    // the view object has changed.
    let view = app.current_screen.blocks.get(this.attrs.block)

    if (!view)
      return this.updateChildren(null)

    let deps = view.deps.map(type => app.services.get(type))
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

    if (view === this.current_view && !dep_changed)
      return

    this.current_view = view
    this.current_deps = newdeps

    // Compute the new view value.
    this.updateChildren(view.fn(...deps))

  }

}

/**
 * Display a Block into the Tree
 */
export function DisplayBlock(block: Block): Node {
  return d(DisplayBlockAtom, {block})
}
