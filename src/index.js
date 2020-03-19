// The console is where it's all happenin'
// Also you can move your mouse around the preview
// screen for some bonus fun. (code for this is at the bottom)

// This code was an experiment to help me learn RX.
// Not having a project to try this stuff on, I thought
// a good way of learning would be to build some pieces
// from the descriptions given in the RX documentation.

// I haven't checked to see if any of this is even close to
// the real implementation of these things so please
// don't take this stuff as any kind of truth.
// It's just me mucking about trying to learn some bits and bobs.

// Example usages are at the bottom and the results can be seen
// in the console.

// Some helpers
const compose = (f, g) => x => f(g(x));
const identity = x => x;
const noop = () => {};

// Subscription object allows subscribers to unsubscribe (dispose)
function Subscription(fn) {
  this.dispose = fn;
}

Subscription.of = fn => new Subscription(fn);

function Observer(onNext = identity, onComplete = noop) {
  this.onNext = onNext;
  this.onComplete = onComplete;
}

Observer.create = (onNext, onComplete) => new Observer(onNext, onComplete);

Observer.prototype.map = function(onNext) {
  return Observer.create(
    compose(
      onNext,
      this.onNext
    ),
    this.onComplete
  );
};

// The protagonist of our story, the Observable.
function Observable(fn, observer = Observer.create()) {
  this.fn = fn;
  this.observer = observer;
}

Observable.create = (fn, observer) => new Observable(fn, observer);

Observable.prototype.subscribe = function(
  onNext,
  onError = () => {},
  onComplete
) {
  try {
    return Subscription.of(
      this.fn(Observer.create(this.observer.map(onNext).onNext, onComplete))
    );
  } catch (e) {
    onError(e);
  }
};

Observable.prototype.map = function(onNext) {
  return Observable.create(this.fn, this.observer.map(onNext));
};

Observable.concat = function(...obs) {
  return Observable.create(observer => {
    function doObserve([current, ...rest]) {
      current.subscribe(
        observer.onNext,
        observer.onError,
        !rest.length ? observer.onComplete : () => doObserve(rest)
      );
    }

    doObserve(obs);
  });
};

// Some tidy ways of creating observables

// This one takes either a promise or an iterable to be observed
// Like you can do from([1, 2, 3]) etc.
const from = observe => {
  const isPromise = !!observe.then;
  const isIterable = typeof observe[Symbol.iterator] === "function";

  return Observable.create(observer => {
    if (isPromise) {
      observe.then(observer.onNext);
    }

    if (isIterable) {
      for (const item of observe) {
        observer.onNext(item);
      }
    }

    observer.onComplete();
  });
};

// This one takes a source and an event name
// You can do stuff like fromEvent(document, 'mousemove')
const fromEvent = (source, event) => {
  return Observable.create(observer => {
    source.addEventListener(event, observer.onNext);

    return () => source.removeEventListener(event, observer.onNext);
  });
};

// Operators - Things you can do with observables

const interval = function(n, observable) {
  return Observable.create(observer => {
    let nextTimer = n;
    let queue = [];
    let innerComplete = false;

    const disp = observable.subscribe(
      v => {
        queue.unshift(v);
        setTimeout(() => {
          observer.onNext(queue.pop());

          if (innerComplete && !queue.length) {
            observer.onComplete();
          }
        }, nextTimer);

        nextTimer = nextTimer + n;
      },
      observer.onError,
      () => (innerComplete = true)
    );

    return () => disp.dispose();
  });
};

const take = (n, observable) =>
  Observable.create(observer => {
    let count = 0;

    const disp = observable.subscribe(v => {
      count++;
      if (count <= n) {
        observer.onNext(v);
      }

      if (count === n) {
        observer.onComplete();
      }
    });

    return () => disp.dispose();
  });

const takeWhile = (fn, observable) => {
  return Observable.create(observer => {
    let truth = true;
    const disp = observable.subscribe(v => {
      truth = truth === false ? truth : fn(v);
      if (truth) {
        observer.onNext(v);
      }
    });

    return () => disp.displose();
  });
};

const takeUntil = (notifier, observable) => {
  return Observable.create(observer => {
    let keepGoing = true;

    notifier.subscribe(v => {
      keepGoing = false;
      observer.onComplete();
    });

    const disp = observable.subscribe(v => {
      if (keepGoing) {
        observer.onNext(v);
      }
    });

    return () => disp.dispose();
  });
};

const takeLast = (n, observable) => {
  return Observable.create(observer => {
    let values = [];
    const disp = observable.subscribe(
      v => values.push(v),
      e => console.log("takeLast error", e),
      () => {
        values
          .slice(values.length - n, values.length)
          .forEach(v => observer.onNext(v));
      }
    );

    return () => disp.dispose();
  });
};

// Example usages

// Basic usage of Observable
const basicObservable = Observable.create(observer => {
  observer.onNext(1);
  observer.onNext(2);
  observer.onNext(3);
  observer.onComplete();
  return () => console.log("clean up/dispose code here");
});

basicObservable
  .map(x => x * 2)
  .subscribe(
    x => console.log("basicObservable next", x),
    e => console.log("error ", e),
    () => console.log("basicObservable complete")
  );

// Using `from` with a string
// Bumping the character to the next char in the alphabet
const stringExample = from("JAMIE")
  .map(x => [x, x.charCodeAt(0) + 1])
  .map(([x, y]) => [x, String.fromCharCode(y)])
  .subscribe(([x, y]) => console.log(x, "== ", y));

// Take the last 2 values from an observable
takeLast(2, from([1, 2, 3, 4])).subscribe(x => console.log("last ", x));

// Take 5 values from an array on an interval
// then only take values that are < 7
takeWhile(
  v => v < 7,
  take(5, interval(1000, from([5, 6, 7, 2, 8, 9, 10, 11, 12, 13])))
).subscribe(
  x => console.log("Less than seven ", x),
  e => console.log("error ", e),
  () => console.log("Array complete")
);

// Combine some observable arrays
// that emit a value on an interval
// then take 11 of them, ignorning the 12th
const a1 = interval(300, from([1, 2, 3, 4]));
const a2 = interval(500, from([5, 6, 7, 8]));
const a3 = interval(200, from([9, 10, 11, 12]));

const combined = Observable.concat(a1, a2, a3);

take(11, combined).subscribe(
  v => console.log("combined with take", v),
  e => console.log("e", e),
  () => console.log("Complete")
);

// Why not build a thing while we're here
// Let's paint some stuff on the screen

const colours = [
  "aquamarine",
  "crimson",
  "coral",
  "lightPink",
  "lightskyblue",
  "palegreen",
  "mediumorchid"
];

function makeSplodge(x, y) {
  const radius = Math.round(Math.random() * 25);
  const borderRadius = Math.round(Math.random() * 50);
  const top = y - radius;
  const left = x - radius;
  const colour = colours[Math.round(Math.random() * colours.length)];
  const div = document.createElement("div");
  div.setAttribute(
    "style",
    `position: absolute; top: ${top}px; left: ${left}px; width: ${radius *
      2}px; height: ${radius *
      2}px; background-color: ${colour}; border-radius: ${borderRadius}%`
  );
  return div;
}

const subscription = fromEvent(document, "mousemove")
  .map(e => [e.clientX, e.clientY])
  .subscribe(([clientX, clientY]) => {
    const splodge = makeSplodge(clientX, clientY);
    document.querySelector("body").appendChild(splodge);
  });

// Unsubscribe from the mouse events after 5 seconds
// Uncomment and refresh screen to see this in action

// setTimeout(() => {
//   subscription.dispose();
// }, 5000);
