use dodrio::bumpalo::{self, Bump};
use dodrio::{Node, Render};
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;

/// Say hello to someone.
struct SayHelloTo {
    /// Who to say hello to.
    who: String,
}

impl SayHelloTo {
    /// Construct a new `SayHelloTo` component.
    fn new<S: Into<String>>(who: S) -> SayHelloTo {
        let who = who.into();
        SayHelloTo { who }
    }

    /// Update who to say hello to.
    fn set_who(&mut self, who: String) {
        self.who = who;
    }
}

// The `Render` implementation has a text `<input>` and a `<div>` that shows a
// greeting to the `<input>`'s value.
impl Render for SayHelloTo {
    fn render<'a, 'bump>(&'a self, bump: &'bump Bump) -> Node<'bump>
    where
        'a: 'bump,
    {
        use dodrio::builder::*;

        div(bump)
            .children([
                input(bump)
                    .attr("type", "text")
                    .attr("value", &self.who)
                    .on("input", |root, vdom, event| {
                        // If the event's target is our input...
                        let input = match event
                            .target()
                            .and_then(|t| t.dyn_into::<web_sys::HtmlInputElement>().ok())
                        {
                            None => return,
                            Some(input) => input,
                        };

                        // ...then get its value and update who we are greeting.
                        let value = input.value();
                        let hello = root.unwrap_mut::<SayHelloTo>();
                        hello.set_who(value);

                        // Finally, re-render the component on the next animation frame.
                        vdom.schedule_render();
                    })
                    .finish(),
                text(bumpalo::format!(in bump, "Hello, {}!", self.who).into_bump_str()),
            ])
            .finish()
    }
}

#[wasm_bindgen(start)]
pub fn run() {
    // Initialize debugging for when/if something goes wrong.
    console_error_panic_hook::set_once();

    // Get the document's `<body>`.
    let window = web_sys::window().unwrap();
    let document = window.document().unwrap();
    let body = document.body().unwrap();

    // Construct a new `SayHelloTo` rendering component.
    let say_hello = SayHelloTo::new("World");

    // Mount the component to the `<body>`.
    let vdom = dodrio::Vdom::new(&body, say_hello);

    // Run the component forever.
    vdom.forget();
}
