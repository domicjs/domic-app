# What

`carbyne-router2` is an application router to be used in conjunction with carbyne.

# How

* At any given moment, an application is in a given state
* A state can be composed of several other states
* A state can be bound on a 1-1 mapping to something that can be put into a hash (rison to the rescue !)
* States specify views. The priority order is determined by the order in which States are instanciated/recuperated.

* States names must be unique


* The compiler must be able to warn the developper instantaneaously when not using the correct
  parameters, etc.

* State arguments should check for required parameters or not and be able to throw readable
  errors when invoked dynamically and show warnings when compiled (this is to allow for
  errors when entering a wrong URL and show where bad calls are being done)

  implement Serializable, use toRison, etc.


There should be an ActiveState class that is able to be linked to the URL.

A new active state is built upon another ActiveState ?
