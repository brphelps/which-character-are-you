#!/usr/bin/env node

import { existsSync } from "node:fs";
import {
  UHCI_CHARACTERS,
  UHCI_DIMENSION_IDS,
  UHCI_QUESTIONS,
  UHCI_SCALE,
} from "../data/uhci.mjs";

const PROFILE_COUNT = 10 ** UHCI_DIMENSION_IDS.length;

function fail(message) {
  throw new Error(message);
}

function validateData() {
  if (UHCI_QUESTIONS.length !== 30) {
    fail(`Expected 30 questions, found ${UHCI_QUESTIONS.length}.`);
  }
  if (UHCI_CHARACTERS.length !== 60) {
    fail(`Expected 60 character entries, found ${UHCI_CHARACTERS.length}.`);
  }

  const ids = new Set();
  for (const entry of UHCI_CHARACTERS) {
    if (ids.has(entry.id)) {
      fail(`Duplicate character ID: ${entry.id}`);
    }
    ids.add(entry.id);

    for (const dimension of UHCI_DIMENSION_IDS) {
      const score = entry.scores[dimension];
      if (
        !Number.isInteger(score)
        || score < UHCI_SCALE.minimum
        || score > UHCI_SCALE.maximum
      ) {
        fail(`Invalid ${dimension} score for ${entry.id}: ${score}`);
      }
    }

    if (
      entry.image
      && !existsSync(new URL(`../${entry.image}`, import.meta.url))
    ) {
      fail(`Missing image for ${entry.id}: ${entry.image}`);
    }
  }
}

function scoreVector(entry) {
  return UHCI_DIMENSION_IDS.map((dimension) => entry.scores[dimension]);
}

function squaredDistance(left, right) {
  let total = 0;
  for (let index = 0; index < left.length; index += 1) {
    const difference = left[index] - right[index];
    total += difference * difference;
  }
  return total;
}

function profileKey(entry) {
  return scoreVector(entry).join("/");
}

function findExactDuplicates(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = profileKey(entry);
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([profile, group]) => ({
      profile,
      entries: group,
    }));
}

function nearestNeighborPairs(entries) {
  const vectors = entries.map(scoreVector);
  const pairs = [];

  for (let left = 0; left < entries.length; left += 1) {
    for (let right = left + 1; right < entries.length; right += 1) {
      pairs.push({
        left: entries[left],
        right: entries[right],
        squaredDistance: squaredDistance(vectors[left], vectors[right]),
      });
    }
  }

  pairs.sort((a, b) => (
    a.squaredDistance - b.squaredDistance
    || a.left.id.localeCompare(b.left.id)
    || a.right.id.localeCompare(b.right.id)
  ));

  return pairs;
}

function dimensionStatistics(entries) {
  return UHCI_DIMENSION_IDS.map((dimension) => {
    const values = entries.map((entry) => entry.scores[dimension]);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce(
      (sum, value) => sum + ((value - mean) ** 2),
      0,
    ) / values.length;
    const frequencies = new Map();

    for (const value of values) {
      frequencies.set(value, (frequencies.get(value) ?? 0) + 1);
    }

    const sameValuePairs = [...frequencies.values()].reduce(
      (sum, count) => sum + ((count * (count - 1)) / 2),
      0,
    );
    const allPairs = (values.length * (values.length - 1)) / 2;

    return {
      dimension,
      minimum: Math.min(...values),
      maximum: Math.max(...values),
      mean,
      standardDeviation: Math.sqrt(variance),
      distinctValues: frequencies.size,
      sameValuePairRate: allPairs === 0 ? 0 : sameValuePairs / allPairs,
    };
  }).sort((a, b) => (
    a.standardDeviation - b.standardDeviation
    || b.sameValuePairRate - a.sameValuePairRate
  ));
}

function enumerateWins(entries) {
  const vectors = entries.map(scoreVector);
  const results = entries.map((entry) => ({
    entry,
    fractionalWins: 0,
    uniqueWins: 0,
    tiedWins: 0,
  }));

  for (let encoded = 0; encoded < PROFILE_COUNT; encoded += 1) {
    let remainder = encoded;
    const a = (remainder % 10) + 1;
    remainder = Math.floor(remainder / 10);
    const b = (remainder % 10) + 1;
    remainder = Math.floor(remainder / 10);
    const c = (remainder % 10) + 1;
    remainder = Math.floor(remainder / 10);
    const d = (remainder % 10) + 1;
    remainder = Math.floor(remainder / 10);
    const e = (remainder % 10) + 1;
    remainder = Math.floor(remainder / 10);
    const f = (remainder % 10) + 1;

    let bestDistance = Number.POSITIVE_INFINITY;
    const winners = [];

    for (let index = 0; index < vectors.length; index += 1) {
      const vector = vectors[index];
      const distance = (
        ((a - vector[0]) ** 2)
        + ((b - vector[1]) ** 2)
        + ((c - vector[2]) ** 2)
        + ((d - vector[3]) ** 2)
        + ((e - vector[4]) ** 2)
        + ((f - vector[5]) ** 2)
      );

      if (distance < bestDistance) {
        bestDistance = distance;
        winners.length = 0;
        winners.push(index);
      } else if (distance === bestDistance) {
        winners.push(index);
      }
    }

    const credit = 1 / winners.length;
    for (const winner of winners) {
      results[winner].fractionalWins += credit;
      if (winners.length === 1) {
        results[winner].uniqueWins += 1;
      } else {
        results[winner].tiedWins += 1;
      }
    }
  }

  const allocatedWins = results.reduce(
    (sum, { fractionalWins }) => sum + fractionalWins,
    0,
  );
  if (Math.abs(allocatedWins - PROFILE_COUNT) > 0.001) {
    fail(`Win allocation mismatch: ${allocatedWins} of ${PROFILE_COUNT}`);
  }

  return results.sort((a, b) => (
    b.fractionalWins - a.fractionalWins
    || a.entry.id.localeCompare(b.entry.id)
  ));
}

function formatPercent(value) {
  return `${(value * 100).toFixed(3)}%`;
}

function formatDistance(squared) {
  return Math.sqrt(squared).toFixed(3);
}

function printCatalog(name, entries) {
  const duplicates = findExactDuplicates(entries);
  const neighbors = nearestNeighborPairs(entries);
  const nonDuplicateNeighbors = neighbors.filter(
    ({ squaredDistance: distance }) => distance > 0,
  );
  const dimensions = dimensionStatistics(entries);
  const wins = enumerateWins(entries);
  const zeroUniqueWinners = wins.filter(({ uniqueWins }) => uniqueWins === 0);
  const lowSeparationPairs = nonDuplicateNeighbors.filter(
    ({ squaredDistance: distance }) => distance <= 2,
  );

  console.log(`## ${name}`);
  console.log("");
  console.log(`Characters: ${entries.length}`);
  console.log(`Enumerated profiles: ${PROFILE_COUNT.toLocaleString("en-US")}`);
  console.log("");
  console.log("### Win frequency");
  console.log("");
  console.log("| Rank | Character | ID | Fractional wins | Share | Unique wins | Tied profiles |");
  console.log("|---:|---|---|---:|---:|---:|---:|");
  wins.forEach((result, index) => {
    console.log(
      `| ${index + 1} | ${result.entry.name}${result.entry.context ? ` (${result.entry.context})` : ""} | \`${result.entry.id}\` | ${result.fractionalWins.toFixed(1)} | ${formatPercent(result.fractionalWins / PROFILE_COUNT)} | ${result.uniqueWins} | ${result.tiedWins} |`,
    );
  });
  console.log("");
  console.log(
    `Entries with no unique winning profile: ${zeroUniqueWinners.length === 0
      ? "none"
      : zeroUniqueWinners.map(({ entry }) => `\`${entry.id}\``).join(", ")}`,
  );
  console.log("");
  console.log("### Exact duplicate profiles");
  console.log("");
  if (duplicates.length === 0) {
    console.log("None.");
  } else {
    for (const duplicate of duplicates) {
      console.log(
        `- \`${duplicate.profile}\`: ${duplicate.entries.map(({ id }) => `\`${id}\``).join(", ")}`,
      );
    }
  }
  console.log("");
  console.log("### Nearest non-identical profiles");
  console.log("");
  console.log("| Character A | Character B | Euclidean distance |");
  console.log("|---|---|---:|");
  for (const pair of nonDuplicateNeighbors.slice(0, 15)) {
    console.log(
      `| \`${pair.left.id}\` | \`${pair.right.id}\` | ${formatDistance(pair.squaredDistance)} |`,
    );
  }
  console.log("");
  console.log(
    `Non-identical pairs at distance <= sqrt(2): ${lowSeparationPairs.length}`,
  );
  console.log("");
  console.log("### Dimension separation");
  console.log("");
  console.log("| Dimension | Range | Mean | Population SD | Distinct values | Same-value pair rate |");
  console.log("|---|---:|---:|---:|---:|---:|");
  for (const dimension of dimensions) {
    console.log(
      `| ${dimension.dimension} | ${dimension.minimum}-${dimension.maximum} | ${dimension.mean.toFixed(3)} | ${dimension.standardDeviation.toFixed(3)} | ${dimension.distinctValues} | ${formatPercent(dimension.sameValuePairRate)} |`,
    );
  }
  console.log("");
}

validateData();

const catalogs = [
  ["Combined catalog", UHCI_CHARACTERS],
  [
    "Sesame Street catalog",
    UHCI_CHARACTERS.filter(({ universe }) => universe === "sesame-street"),
  ],
  [
    "Muppets catalog",
    UHCI_CHARACTERS.filter(({ universe }) => universe === "muppets"),
  ],
];

console.log("# UHCI calibration analysis");
console.log("");
console.log("Generated by `node scripts/analyze-calibration.mjs`.");
console.log(
  "Distances use unweighted Euclidean distance. Exact ties split one win equally among all nearest characters.",
);
console.log(
  "The exhaustive grid contains every integer-valued 1-10 profile across all six dimensions.",
);
console.log("");

for (const [name, entries] of catalogs) {
  printCatalog(name, entries);
}
