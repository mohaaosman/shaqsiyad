import { baseFilters, buildQuery, chunkRequests, componentPropertyValues, groupTargets, isShaqsiyadCollection, layerKey, parseSeed, planModes, planTargets, textFor, variableValues, type FillRequest, type Filters, type Person } from './logic';

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
  // Component instances: fill TEXT properties named after fields (name, job, city…).
  const instances = root.type === 'INSTANCE' ? [root] : [];
  if ('findAllWithCriteria' in root) instances.push(...root.findAllWithCriteria({ types: ['INSTANCE'] }));
  for (const instance of instances) {
    const values = componentPropertyValues(instance.componentProperties, person);
    if (Object.keys(values).length) instance.setProperties(values);
  }
}

/** Give each filled frame its own mode of the "Shaqsiyad" variable collection, holding that person's values. */
async function fillVariables(filled: { node: SceneNode; person: Person }[]): Promise<string> {
  const collection = (await figma.variables.getLocalVariableCollectionsAsync()).find((c) => isShaqsiyadCollection(c.name));
  if (!collection) return 'no "Shaqsiyad" variable collection in this file';
  const variables = (await Promise.all(collection.variableIds.map((id) => figma.variables.getVariableByIdAsync(id)))).filter((v): v is Variable => v !== null);
  let done = 0;
  for (const [i, action] of planModes(collection.modes, filled.map((f) => f.person.firstName)).entries()) {
    let modeId: string;
    try {
      if (action.kind === 'reuse') {
        collection.renameMode(action.modeId, action.name);
        modeId = action.modeId;
      } else {
        modeId = collection.addMode(action.name);
      }
    } catch {
      return `variables set for ${done} of ${filled.length}: your Figma plan limits how many modes a collection can have`;
    }
    const { node, person } = filled[i];
    for (const { id, value } of variableValues(variables, person)) variables.find((v) => v.id === id)!.setValueForMode(modeId, value);
    if ('setExplicitVariableModeForCollection' in node) node.setExplicitVariableModeForCollection(collection, modeId);
    done++;
  }
  return `variables set for ${done}`;
}

figma.showUI(__html__, { width: 300, height: 470 });

figma.ui.onmessage = async (request: FillRequest) => {
  const selection = figma.currentPage.selection;
  if (!selection.length) return figma.notify('Select one or more frames first');
  try {
    const seed = parseSeed(request.seed);
    const groups = groupTargets(planTargets(selection as readonly SceneNode[]), baseFilters(request));
    const filled: { node: SceneNode; person: Person }[] = [];
    for (const [i, group] of groups.entries()) {
      // Offset seeds per group so different filter groups don't all start from the same seed.
      const people = await fetchPeople(group.nodes.length, group.filters, seed === undefined ? undefined : seed + i * 1000);
      const pairs = group.nodes.slice(0, people.length).map((node, j) => ({ node, person: people[j] }));
      await Promise.all(pairs.map(({ node, person }) => fillNode(node, person)));
      filled.push(...pairs);
    }
    const note = request.variables ? ` · ${await fillVariables(filled)}` : '';
    figma.notify(`Filled ${filled.length} with fictional people${note}`);
  } catch (e) {
    figma.notify(`Shaqsiyad: ${(e as Error).message}`, { error: true });
  }
};
