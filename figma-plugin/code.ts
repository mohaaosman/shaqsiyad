const ORIGIN = 'https://shaqsiyad.example';

interface Person {
  fullName: string;
  firstName: string;
  age: number;
  city: string;
  country: string;
  tagline: string;
  ethnicity: string;
  religion: { name: string; branch: string };
  career: { title: string };
  contact: { email: string };
  avatar: { sizes: { png: string } };
}

interface FillRequest {
  type: 'fill';
  gender: string;
  continent: string;
  minAge: string;
  maxAge: string;
  seed: string;
}

const textFor = (p: Person): Record<string, string> => ({
  '#name': p.fullName,
  '#first': p.firstName,
  '#age': String(p.age),
  '#job': p.career.title,
  '#city': p.city,
  '#country': p.country,
  '#email': p.contact.email,
  '#tagline': p.tagline,
  '#ethnicity': p.ethnicity,
  '#religion': p.religion.name
});

async function fetchPeople(count: number, request: FillRequest): Promise<Person[]> {
  // The plugin sandbox has no URLSearchParams, so build the query by hand.
  const pairs = [`count=${count}`];
  for (const key of ['gender', 'continent', 'minAge', 'maxAge', 'seed'] as const) if (request[key]) pairs.push(`${key}=${encodeURIComponent(request[key])}`);
  const res = await fetch(`${ORIGIN}/api/v1/personas/random?${pairs.join('&')}`);
  if (!res.ok) throw new Error(((await res.json()) as { error: string }).error);
  return (await res.json()) as Person[];
}

async function fillNode(root: SceneNode, person: Person) {
  const texts = textFor(person);
  const targets = 'findAll' in root ? root.findAll((n) => n.name.startsWith('#')) : [];
  for (const node of [root, ...targets]) {
    if (node.type === 'TEXT' && texts[node.name] !== undefined) {
      await Promise.all(node.getRangeAllFontNames(0, node.characters.length).map((font) => figma.loadFontAsync(font)));
      node.characters = texts[node.name];
    }
    if (node.name === '#avatar' && 'fills' in node) {
      const image = await figma.createImageAsync(`${ORIGIN}${person.avatar.sizes.png}`);
      node.fills = [{ type: 'IMAGE', imageHash: image.hash, scaleMode: 'FILL' }];
    }
  }
}

figma.showUI(__html__, { width: 300, height: 360 });

figma.ui.onmessage = async (request: FillRequest) => {
  const selection = figma.currentPage.selection;
  if (!selection.length) return figma.notify('Select one or more frames first');
  try {
    const people = await fetchPeople(Math.min(selection.length, 50), request);
    await Promise.all(selection.slice(0, people.length).map((node, i) => fillNode(node, people[i])));
    figma.notify(`Filled ${people.length} with fictional people`);
  } catch (e) {
    figma.notify(`Shaqsiyad: ${(e as Error).message}`, { error: true });
  }
};
