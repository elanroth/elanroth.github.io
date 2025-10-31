import { ImageWithFallback } from "../figma/ImageWithFallback";
import profileImage from "dist/images/IMG_1852.jpeg";
import { Card } from "../ui/card";


const currentProjects = [
  {
    title: "Project Title 1",
    description:
      "Brief description of what this project is about and what you're currently working on.",
  },
  {
    title: "Project Title 2",
    description:
      "Another project that you're actively developing or researching.",
  },
  {
    title: "Project Title 3",
    description:
      "A third project that represents your current focus areas.",
  },
];

export function Home() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="grid md:grid-cols-[1fr_350px] gap-8 mb-12">
        <div className="flex flex-col justify-center space-y-4">
          <h1 className="text-3xl md:text-4xl">Elan Roth</h1>
          <p className="text-muted-foreground leading-relaxed">
          Currently researching mathematical logic at the University of Waterloo being
          supported by the US Fulbright Program. Mathematically, I am most interested in
          computability theory and type theory, especially formal proof assistants. Generally,
          I am curious how mathematics can model religious belief and be used to
          create and improve interfaith dialogue.
          </p>
        </div>

        <div className="flex justify-center md:justify-end">
          <div className="w-80 h-80 rounded-2xl overflow-hidden border-2 border-primary/20 shadow-lg">
            <ImageWithFallback
              src="/images/IMG_1852.jpeg"
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
