# Understanding Equality Homotopy Style

## Motivation

To be honest, when I applied to Penn as a logic major, I thought I knew what logic was. Four years later, I can now acknowledge that I had no idea what was going on. I liked philosophy and I liked math, so it seemed like a nice intersection. In my sophomore year, I took my first proof-based course... loved it. Quite captiving the way Queen Math fights only for truth and yields proof as her weapon. In my junior year, I enrolled in an introduction to logic course taught by proof theorist, Dr. Henry Towsner. Abstraction of truth. The (capital T) Truth of a statement had become reliant on the world in which it is being perceived. To know if the statements $x+0=x$ or $2x=1$ are true, we need more context. Is $x$ a whole number? Can $x = \frac{1}{2}$? What values can $x$ take on? What does "$=$" mean here? What is $2$?

<!-- During my time in the halls of David Ritthouse Labs (DRL) Penn's beautiful math building, I heard whispers of a relatively new beast called Homotopy Type Theory (HoTT). I was warned to stay away as it required knowledge of multiple fields and would not be useful. Yet, when I decided to conduct an an independent study during my last semester, I knew it was time to take on the monster. **the following is my experience...** -->

## What even is HoTT?

What is a *homotopy*? That's when I hit the first wall. *How many more were coming?* I learned that a homotopy is a notion of equivalence between two paths if you can deform one into another continuously. Meaning, if we fix two endpints and hace two different lines between them, a *homotopy* is a map that transform one line into the other without breaks, as done in the image below.

![Paths](/images/blog/Homotopy.gif "Paths")

Note that this process is not always possible. For example, there could a hole in between the two paths so that you cannot deform the first path into the other without breaking up the original line. These paths exist in any abstract space, and do not necessarily need to be between two points as we know them. We can use sets, or functions, or any other mathematical object of your choice to as abstract "points" in space. To build a geometric intution, we will stick to points as we know them on for now.

It turns out that given any space, we can classify all of its paths up to homotopy equivalence. For each pair of paths between the same points, we can ask if these paths are homotopic. Furthermore, we can indentify paths if they are homotopic, and then consider the structure of these non-equivalent paths.

### The Disk

A disk is essentially a filled in circle, meaning our points exist within and on the boundary of a two-dimensional circle. Every single path here is homotopy equivalent. Consider two arbitrary points and two arbitrary paths between them. By the nature of a circle, we can always slide one path into the other without leaving the circle. In fact, the same works with a square, a triangle, or any convex shape! Since all paths are homotopic, we can identify them all together. Meaning every path in this space is essentially the same. Homotopy does not *detect* any hidden structure. Not all spaces behave this way.

### The Circle

Now remove the interior and leave only the points on the boundary. We can now have two homotopically non-equivalent paths! Since we can pick any two points (even when they are the same), let's consider paths from the point at the top of the circle to itself.

First, consider the constant path, starting at the top of the circle and not moving. Now consider the path that goes once around the circle clockwise. Because of this giant hole in the middle (a.k.a. the interior), we cannot continuously transform the first to the second or vice versa. (If you have not noticed yet, homotopies work in reverse, as well. So it doesn't necessarily matter from which path we start.) Why stop here?! Let's go around the circle two times, three times, four times,... you get the point. Why stop here?! Instead of clockwise, let's go counter clockwise! One time, two times, three times,... you get the point. So not only is every path the same here, but we have distinctly different paths characterized by the direction and how many times we loop around. We have two choices for direction and infinitely many for number of loops.

That's right! The integers are hidden within the circle! It took a long time for me to internalize how this structure is somehow hidden

### Two Circles with a Shared Point




The first word of HoTT only took me two months to understand. So fun! The "type theory" piece felt more approachable after my summer doing research with the Programming Languages group in the computer science department. So how do these pieces come together? Well, it turns out that given any space, we can classify all of its paths up to homotopy equivalence. Let's look up at a few examples to understand.