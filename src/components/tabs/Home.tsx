import { ImageWithFallback } from "../figma/ImageWithFallback";
import { Card } from "../ui/card";


const currentProjects = [
  {
    title: "Optimal Scott Sentences of Reduced Abelian p-Groups",
    description:
      "Working with Dr. Barbara Csima to characterize the Scott complexity of specific groups",
  },
  {
    title: "Formalizing Turing Degrees in Lean 4",
    description:
      "We are contributing to mathlib libary by formally defining these computable theoretic notions",
  },
  // {
  //   title: "Measuring Moduli Fibonacci Cycles",
  //   description:
  //     "I thought it'd be fun to try to measure the area of curves created by the Fibonacci sequence modulo a fixed n",
  // },
];

export function Home() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="grid md:grid-cols-[1fr_350px] gap-8 mb-12">
        <div className="flex flex-col justify-center space-y-4">
          {/* <h1 className="text-3xl md:text-4xl">Elan Roth</h1> */}
          <p className="text-muted-foreground leading-relaxed">
          Currently researching mathematical logic at the University of Waterloo with Dr. Barbara Csima 
          on a Fulbright Scholarship. I am most interested in
          computability theory and type theory, especially working with formal proof assistants.
          </p>
        </div>

        <div className="flex justify-center md:justify-end">
          <div className="w-80 h-80 rounded-2xl overflow-hidden border-2 border-primary/20 shadow-lg">
            <ImageWithFallback
              src="/images/Curr.JPG"
              alt="Elan Roth"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-6">Current Projects</h2>
        <div className="space-y-4">
          {currentProjects.map((project, index) => (
            <Card key={index} className="p-6 bg-card hover:border-primary/30 transition-colors">
              <h3 className="mb-2">{project.title}</h3>
              <p className="text-muted-foreground">{project.description}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
