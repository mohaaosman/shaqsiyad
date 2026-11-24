import { baseFilters, buildQuery, chunkRequests, groupTargets, layerKey, parseSeed, planTargets, textFor, type FillRequest, type Filters, type Person } from './logic';

const ORIGIN = 'https://shaqsiyad.example';

async function fetchPeople(count: number, filters: Filters, seed?: number): Promise<Person[]> {
  const people: Person[] = [];
  for (const chunk of chunkRequests(count, seed)) {
    const res = await fetch(`${ORIGIN}/api/v1/personas/random?${buildQuery(filters, chunk.count, chunk.seed)}`);
    if (!res.ok) throw new Error(((await res.json()) as { error: string }).error);
    people.push(...((await res.json()) as Person[]));
  }
  return people;
}

async function fillNode(root: SceneNode, person: Person) {
  const texts = textFor(person);
  const targets = 'findAll' in root ? root.findAll((n) => n.name.startsWith('#')) : [];
  for (const node of [root, ...targets]) {
    const key = layerKey(node.name);
    if (node.type === 'TEXT' && texts[key] !== undefined) {
      await Promise.all(node.getRangeAllFontNames(0, node.characters.length).map((font) => figma.loadFontAsync(font)));
      node.characters = texts[key];
    }
    if (key === '#avatar' && 'fills' in node) {
      const image = await figma.createImageAsync(`${ORIGIN}${person.avatar.sizes.png}`);
      node.fills = [{ type: 'IMAGE', imageHash: image.hash, scaleMode: 'FILL' }];
    }
  }
}

figma.showUI(__html__, { width: 300, height: 420 });

figma.ui.onmessage = async (request: FillRequest) => {
  const selection = figma.currentPage.selection;
  if (!selection.length) return figma.notify('Select one or more frames first');
  try {
    const seed = parseSeed(request.seed);
    const groups = groupTargets(planTargets(selection as readonly SceneNode[]), baseFilters(request));
    let filled = 0;
    for (const [i, group] of groups.entries()) {
      // Offset seeds per group so different filter groups don't all start from the same seed.
      const people = await fetchPeople(group.nodes.length, group.filters, seed === undefined ? undefined : seed + i * 1000);
      await Promise.all(group.nodes.slice(0, people.length).map((node, j) => fillNode(node, people[j])));
      filled += Math.min(people.length, group.nodes.length);
    }
    figma.notify(`Filled ${filled} with fictional people`);
  } catch (e) {
    figma.notify(`Shaqsiyad: ${(e as Error).message}`, { error: true });
  }
};
