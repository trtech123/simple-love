import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { completeMatchingSession } from "../../src/domain/matching/session";
import { createSupabaseMatchingSessionRepository } from "../../src/domain/quiz/supabase-repository";

type Row = Record<string, unknown>;
type FakeDb = Record<string, Row[]>;

const traitKeys = [
  "emotional_profile",
  "communication_style",
  "commitment_readiness",
  "relationship_vision",
] as const;

const questionRows = [
  { id: "question-emotional", stable_key: "match_q01", position: 1 },
  { id: "question-communication", stable_key: "match_q31", position: 2 },
  { id: "question-commitment", stable_key: "match_q66", position: 3 },
  { id: "question-vision", stable_key: "match_q80", position: 4 },
];

const visualDimensions = [
  "minimal_expressive",
  "urban_nature",
  "cozy_polished",
  "spontaneous_curated",
  "quiet_social",
] as const;

function createFakeSupabase(db: FakeDb) {
  return {
    from(table: string) {
      return new FakeQueryBuilder(db, table);
    },
  } as unknown as SupabaseClient;
}

function createDb(overrides: Partial<FakeDb> = {}): FakeDb {
  const questions = questionRows.map((question) => ({
    ...question,
    prompt: question.id,
    question_type: "multiple_choice",
    questionnaire_block_id: "block-1",
  }));

  const questionOptions = questionRows.flatMap((question) => [
    {
      id: `${question.id}-low`,
      question_id: question.id,
      label: "Low",
      value: "low",
      position: 1,
    },
    {
      id: `${question.id}-high`,
      question_id: question.id,
      label: "High",
      value: "high",
      position: 2,
    },
  ]);

  return {
    questionnaires: [{ id: "questionnaire-1", slug: "matching-depth-v1", purpose: "matching", title: "Matching" }],
    questionnaire_versions: [
      {
        id: "matching-version-1",
        questionnaire_id: "questionnaire-1",
        version: 1,
        status: "published",
      },
    ],
    questionnaire_blocks: [{ id: "block-1", questionnaire_version_id: "matching-version-1", position: 1 }],
    questions,
    question_options: questionOptions,
    quiz_sessions: [
      {
        id: "session-1",
        public_token: "matching-token",
        user_id: "user-b",
        questionnaire_version_id: "matching-version-1",
        status: "started",
      },
    ],
    quiz_answers: questionRows.map((question) => ({
      quiz_session_id: "session-1",
      question_id: question.id,
      question_option_id: `${question.id}-high`,
    })),
    profiles: [],
    profile_traits: [],
    user_blocks: [],
    profile_deal_breakers: [],
    match_settings: [],
    match_settings_versions: [],
    matches: [],
    match_explanations: [],
    ...overrides,
  };
}

function currentProfile(overrides: Row = {}): Row {
  return {
    user_id: "user-b",
    birth_year: 1994,
    preferred_age_min: 28,
    preferred_age_max: 38,
    gender: "woman",
    interested_in: "man",
    location_text: "Tel Aviv",
    location_latitude: 32.0853,
    location_longitude: 34.7818,
    preferred_distance_km: 50,
    relationship_intention: "serious",
    disabled_at: null,
    completed_depth_questionnaire_at: null,
    ...overrides,
  };
}

function compatibleProfile(userId: string, overrides: Row = {}): Row {
  return {
    user_id: userId,
    birth_year: 1992,
    preferred_age_min: 28,
    preferred_age_max: 38,
    gender: "man",
    interested_in: "woman",
    location_text: "Tel Aviv",
    location_latitude: 32.0684,
    location_longitude: 34.8248,
    preferred_distance_km: 50,
    relationship_intention: "serious",
    disabled_at: null,
    completed_depth_questionnaire_at: "2026-06-02T10:00:00.000Z",
    ...overrides,
  };
}

function traitRows(userId: string, value = 100): Row[] {
  return traitKeys.map((traitKey) => ({
    user_id: userId,
    trait_key: traitKey,
    numeric_value: value,
    text_value: null,
    source_answer_ids: [],
  }));
}

function repositoryFor(db: FakeDb) {
  return createSupabaseMatchingSessionRepository(createFakeSupabase(db));
}

describe("createSupabaseMatchingSessionRepository", () => {
  it("completes a matching session, persists traits, matches, and explanations idempotently", async () => {
    const db = createDb({
      profiles: [currentProfile(), compatibleProfile("user-a")],
      profile_traits: traitRows("user-a"),
      profile_deal_breakers: [
        { user_id: "user-b", normalized_key: "smoking" },
        { user_id: "user-a", normalized_key: "pets" },
      ],
    });
    const repository = repositoryFor(db);

    await expect(completeMatchingSession(repository, "user-b", "matching-token")).resolves.toEqual({
      completed: true,
      matchCount: 1,
    });
    await expect(completeMatchingSession(repository, "user-b", "matching-token")).resolves.toEqual({
      completed: true,
      matchCount: 1,
    });

    expect(db.quiz_sessions[0]).toEqual(expect.objectContaining({ status: "completed" }));

    const currentTraits = db.profile_traits.filter((row) => row.user_id === "user-b");
    expect(currentTraits).toHaveLength(4);
    expect(currentTraits.map((row) => row.trait_key).sort()).toEqual([...traitKeys].sort());
    expect(currentTraits.every((row) => row.numeric_value === 100)).toBe(true);

    expect(db.profiles.find((row) => row.user_id === "user-b")).toEqual(
      expect.objectContaining({
        completed_depth_questionnaire_at: expect.any(String),
        updated_at: expect.any(String),
      }),
    );

    expect(db.matches).toHaveLength(1);
    expect(db.matches[0]).toEqual(
      expect.objectContaining({
        user_a: "user-a",
        user_b: "user-b",
        status: "active",
        score: 98,
        match_settings_version_id: db.match_settings_versions[0].id,
      }),
    );

    expect(db.match_explanations).toEqual([
      expect.objectContaining({
        match_id: db.matches[0].id,
        explanation: expect.objectContaining({
          summary: expect.any(String),
          traitScores: expect.objectContaining({
            emotional_profile: 100,
            communication_style: 94,
            commitment_readiness: 100,
            relationship_vision: 100,
          }),
          logisticsScores: expect.objectContaining({
            reciprocalAgeFit: 100,
            distanceFit: 91,
            overall: 96,
          }),
          breakdown: expect.objectContaining({
            trait: 98,
            logistics: 96,
            final: 98,
          }),
          reasons: expect.arrayContaining([expect.any(String)]),
        }),
      }),
    ]);
  });

  it("excludes candidates blocked by either user and candidates that fail hard filters", async () => {
    const candidateIds = [
      "user-a",
      "blocked-by-current",
      "blocks-current",
      "deal-breaker-overlap",
      "intention-mismatch",
      "age-mismatch",
      "location-mismatch",
      "disabled-profile",
    ];
    const db = createDb({
      profiles: [
        currentProfile(),
        compatibleProfile("user-a"),
        compatibleProfile("blocked-by-current"),
        compatibleProfile("blocks-current"),
        compatibleProfile("deal-breaker-overlap"),
        compatibleProfile("intention-mismatch", { relationship_intention: "casual" }),
        compatibleProfile("age-mismatch", { preferred_age_min: 50, preferred_age_max: 70 }),
        compatibleProfile("location-mismatch", {
          location_text: "Haifa",
          location_latitude: 32.794,
          location_longitude: 34.9896,
        }),
        compatibleProfile("disabled-profile", { disabled_at: "2026-06-02T10:00:00.000Z" }),
      ],
      profile_traits: candidateIds.flatMap((userId) => traitRows(userId)),
      user_blocks: [
        { blocker_id: "user-b", blocked_user_id: "blocked-by-current" },
        { blocker_id: "blocks-current", blocked_user_id: "user-b" },
      ],
      profile_deal_breakers: [
        { user_id: "user-b", normalized_key: "smoking" },
        { user_id: "user-a", normalized_key: "pets" },
        { user_id: "deal-breaker-overlap", normalized_key: "smoking" },
      ],
    });

    const result = await completeMatchingSession(repositoryFor(db), "user-b", "matching-token");

    expect(result).toEqual({ completed: true, matchCount: 1 });
    expect(db.matches).toEqual([
      expect.objectContaining({
        user_a: "user-a",
        user_b: "user-b",
      }),
    ]);
  });

  it("persists only matches within both users' selected distance radius", async () => {
    const db = createDb({
      profiles: [
        currentProfile({ preferred_distance_km: 20 }),
        compatibleProfile("user-a", { location_text: "Ramat Gan", preferred_distance_km: 20 }),
        compatibleProfile("outside-current-radius", {
          location_text: "Jerusalem",
          location_latitude: 31.7683,
          location_longitude: 35.2137,
          preferred_distance_km: 100,
        }),
        compatibleProfile("outside-candidate-radius", {
          location_text: "Ramat Gan",
          location_latitude: 32.0684,
          location_longitude: 34.8248,
          preferred_distance_km: 2,
        }),
      ],
      profile_traits: ["user-a", "outside-current-radius", "outside-candidate-radius"].flatMap((userId) =>
        traitRows(userId),
      ),
      profile_deal_breakers: [
        { user_id: "user-b", normalized_key: "smoking" },
        { user_id: "user-a", normalized_key: "pets" },
        { user_id: "outside-current-radius", normalized_key: "pets" },
        { user_id: "outside-candidate-radius", normalized_key: "pets" },
      ],
    });

    const result = await completeMatchingSession(repositoryFor(db), "user-b", "matching-token");

    expect(result).toEqual({ completed: true, matchCount: 1 });
    expect(db.matches).toEqual([
      expect.objectContaining({
        user_a: "user-a",
        user_b: "user-b",
      }),
    ]);
  });

  it("uses the latest published match settings when generating matches", async () => {
    const db = createDb({
      profiles: [currentProfile(), compatibleProfile("user-a")],
      profile_traits: [
        ...traitRows("user-a", 100).map((row) =>
          row.trait_key === "communication_style" ? { ...row, numeric_value: 100 } : { ...row, numeric_value: 0 },
        ),
      ],
      profile_deal_breakers: [
        { user_id: "user-b", normalized_key: "smoking" },
        { user_id: "user-a", normalized_key: "pets" },
      ],
      match_settings: [{ id: "settings-1", slug: "default-v1" }],
      match_settings_versions: [
        {
          id: "settings-version-draft",
          match_settings_id: "settings-1",
          version: 1,
          status: "draft",
          weights: { emotional_profile: 100, communication_style: 0, commitment_readiness: 0, relationship_vision: 0 },
          hard_filters: {},
          published_at: null,
        },
        {
          id: "settings-version-published",
          match_settings_id: "settings-1",
          version: 2,
          status: "published",
          weights: { emotional_profile: 0, communication_style: 100, commitment_readiness: 0, relationship_vision: 0 },
          hard_filters: {},
          published_at: "2026-06-05T10:00:00.000Z",
        },
      ],
    });

    const result = await completeMatchingSession(repositoryFor(db), "user-b", "matching-token");

    expect(result).toEqual({ completed: true, matchCount: 1 });
    expect(db.match_settings).toHaveLength(1);
    expect(db.matches[0]).toEqual(
      expect.objectContaining({
        match_settings_version_id: "settings-version-published",
        score: 94,
      }),
    );
  });

  it("falls back to default match settings when skipped questionnaire generation finds an invalid published settings version", async () => {
    const db = createDb({
      profiles: [currentProfile()],
      match_settings: [{ id: "settings-1", slug: "default-v1" }],
      match_settings_versions: [
        {
          id: "settings-version-invalid",
          match_settings_id: "settings-1",
          version: 2,
          status: "published",
          weights: {
            emotional_profile: 0,
            communication_style: 0,
            commitment_readiness: 0,
            relationship_vision: 0,
            visual_taste: 0,
          },
          hard_filters: [],
          deal_breaker_filters: [],
          published_at: "2026-06-05T10:00:00.000Z",
        },
      ],
    });

    const result = await repositoryFor(db).skipQuestionnaireAndGenerateMatches("user-b");

    expect(result).toBe(0);
    expect(db.profiles.find((row) => row.user_id === "user-b")).toEqual(
      expect.objectContaining({
        completed_depth_questionnaire_at: expect.any(String),
        updated_at: expect.any(String),
      }),
    );
    expect(db.match_settings_versions).toContainEqual(
      expect.objectContaining({
        match_settings_id: "settings-1",
        version: 1,
        status: "published",
        weights: expect.objectContaining({ emotional_profile: 30 }),
      }),
    );
  });

  it("persists visual taste traits and includes visual taste in match explanations", async () => {
    const visualQuestions = visualDimensions.map((dimension, index) => ({
      id: `visual-question-${dimension}`,
      stable_key: `visual_taste_${String(index + 1).padStart(2, "0")}`,
      prompt: `Visual ${dimension}`,
      question_type: "multiple_choice",
      questionnaire_block_id: "block-1",
      position: questionRows.length + index + 1,
      usage_flags: { matchingInput: true, visualTaste: true },
    }));
    const visualOptions = visualQuestions.flatMap((question, index) => {
      const dimension = visualDimensions[index];
      return [
        {
          id: `${question.id}-low`,
          question_id: question.id,
          label: "Low",
          value: "low",
          position: 1,
          score: { visual_taste: { [dimension]: -1 } },
        },
        {
          id: `${question.id}-high`,
          question_id: question.id,
          label: "High",
          value: "high",
          position: 2,
          score: { visual_taste: { [dimension]: 1 } },
        },
        {
          id: `${question.id}-skip`,
          question_id: question.id,
          label: "No preference",
          value: "skip",
          position: 3,
          score: { visual_taste: { skip: true } },
        },
      ];
    });
    const db = createDb({
      questions: [
        ...createDb().questions,
        ...visualQuestions,
      ],
      question_options: [
        ...createDb().question_options,
        ...visualOptions,
      ],
      quiz_answers: [
        ...createDb().quiz_answers,
        ...visualQuestions.map((question) => ({
          quiz_session_id: "session-1",
          question_id: question.id,
          question_option_id: `${question.id}-high`,
        })),
      ],
      profiles: [currentProfile(), compatibleProfile("user-a")],
      profile_traits: [
        ...traitRows("user-a"),
        { user_id: "user-a", trait_key: "visual_taste", numeric_value: 100, text_value: null, source_answer_ids: [] },
        ...visualDimensions.map((dimension) => ({
          user_id: "user-a",
          trait_key: `visual_taste_${dimension}`,
          numeric_value: 100,
          text_value: null,
          source_answer_ids: [],
        })),
      ],
      profile_deal_breakers: [
        { user_id: "user-b", normalized_key: "smoking" },
        { user_id: "user-a", normalized_key: "pets" },
      ],
    });

    const result = await completeMatchingSession(repositoryFor(db), "user-b", "matching-token");

    expect(result).toEqual({ completed: true, matchCount: 1 });
    expect(db.profile_traits.filter((row) => row.user_id === "user-b").map((row) => row.trait_key).sort()).toEqual(
      [
        ...traitKeys,
        "visual_taste",
        ...visualDimensions.map((dimension) => `visual_taste_${dimension}`),
      ].sort(),
    );
    expect(db.match_explanations[0]).toEqual(
      expect.objectContaining({
        explanation: expect.objectContaining({
          traitScores: expect.objectContaining({
            visual_taste: 100,
          }),
        }),
      }),
    );
  });

  it("hides stale active matches and reactivates compatible hidden matches involving the completed user", async () => {
    const db = createDb({
      profiles: [
        currentProfile(),
        compatibleProfile("compatible-hidden"),
        compatibleProfile("stale-active", { relationship_intention: "casual" }),
      ],
      profile_traits: ["compatible-hidden", "stale-active"].flatMap((userId) => traitRows(userId)),
      profile_deal_breakers: [
        { user_id: "user-b", normalized_key: "smoking" },
        { user_id: "compatible-hidden", normalized_key: "pets" },
        { user_id: "stale-active", normalized_key: "pets" },
      ],
      matches: [
        {
          id: "hidden-match",
          user_a: "compatible-hidden",
          user_b: "user-b",
          status: "hidden",
          score: 10,
          match_settings_version_id: "old-version",
          calculated_at: "2026-06-01T10:00:00.000Z",
        },
        {
          id: "stale-match",
          user_a: "stale-active",
          user_b: "user-b",
          status: "active",
          score: 100,
          match_settings_version_id: "old-version",
          calculated_at: "2026-06-01T10:00:00.000Z",
        },
        {
          id: "unrelated-match",
          user_a: "unrelated-user",
          user_b: "someone-else",
          status: "active",
          score: 100,
          match_settings_version_id: "old-version",
          calculated_at: "2026-06-01T10:00:00.000Z",
        },
      ],
    });

    const result = await completeMatchingSession(repositoryFor(db), "user-b", "matching-token");

    expect(result).toEqual({ completed: true, matchCount: 1 });
    expect(db.matches.find((row) => row.id === "hidden-match")).toEqual(
      expect.objectContaining({ status: "active", score: 98 }),
    );
    expect(db.matches.find((row) => row.id === "stale-match")).toEqual(
      expect.objectContaining({ status: "hidden" }),
    );
    expect(db.matches.find((row) => row.id === "unrelated-match")).toEqual(
      expect.objectContaining({ status: "active" }),
    );
  });
});

type Filter =
  | { type: "eq"; column: string; value: unknown }
  | { type: "in"; column: string; values: unknown[] }
  | { type: "is"; column: string; value: unknown }
  | { type: "not-is-null"; column: string };

class FakeQueryBuilder {
  error = null;

  private readonly filters: Filter[] = [];
  private readonly orderBy: Array<{ column: string; ascending: boolean }> = [];
  private limitCount: number | null = null;
  private pendingUpdate: Row | null = null;
  private selectedRows: Row[] | null = null;

  constructor(
    private readonly db: FakeDb,
    private readonly table: string,
  ) {}

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ type: "eq", column, value });
    this.applyPendingUpdate();
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push({ type: "in", column, values });
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push({ type: "is", column, value });
    return this;
  }

  not(column: string, operator: string, value: unknown) {
    if (operator === "is" && value === null) {
      this.filters.push({ type: "not-is-null", column });
    }
    return this;
  }

  order(column: string, options: { ascending?: boolean } = {}) {
    this.orderBy.push({ column, ascending: options.ascending ?? true });
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  update(payload: Row) {
    this.pendingUpdate = payload;
    return this;
  }

  upsert(payload: Row | Row[], options: { onConflict?: string } = {}) {
    const payloads = Array.isArray(payload) ? payload : [payload];
    this.selectedRows = payloads.map((item) => this.upsertOne(item, options.onConflict));
    return this;
  }

  async returns<T = Row[]>() {
    return { data: this.filteredRows() as T, error: null };
  }

  async maybeSingle<T = Row>() {
    return { data: (this.filteredRows()[0] ?? null) as T | null, error: null };
  }

  async single<T = Row>() {
    const data = this.selectedRows?.[0] ?? this.filteredRows()[0] ?? null;
    return { data: data as T, error: null };
  }

  private tableRows() {
    this.db[this.table] ??= [];
    return this.db[this.table];
  }

  private upsertOne(payload: Row, onConflict?: string) {
    const rows = this.tableRows();
    const conflictColumns = (onConflict ?? "id").split(",").map((column) => column.trim());
    const existing = rows.find((row) =>
      conflictColumns.every((column) => row[column] !== undefined && row[column] === payload[column]),
    );

    if (existing) {
      Object.assign(existing, payload);
      return existing;
    }

    const inserted = { ...payload };
    if (inserted.id === undefined && ["match_settings", "match_settings_versions", "matches"].includes(this.table)) {
      inserted.id = `${this.table}-${rows.length + 1}`;
    }

    rows.push(inserted);
    return inserted;
  }

  private applyPendingUpdate() {
    if (!this.pendingUpdate) {
      return;
    }

    for (const row of this.filteredRows()) {
      Object.assign(row, this.pendingUpdate);
    }
    this.pendingUpdate = null;
  }

  private filteredRows() {
    let rows = this.tableRows().filter((row) =>
      this.filters.every((filter) => {
        if (filter.type === "eq") {
          return row[filter.column] === filter.value;
        }
        if (filter.type === "in") {
          return filter.values.includes(row[filter.column]);
        }
        if (filter.type === "is") {
          return row[filter.column] === filter.value;
        }
        return row[filter.column] !== null;
      }),
    );

    for (const order of [...this.orderBy].reverse()) {
      rows = [...rows].sort((left, right) => {
        const leftValue = left[order.column];
        const rightValue = right[order.column];
        if (leftValue === rightValue) {
          return 0;
        }
        return (String(leftValue) > String(rightValue) ? 1 : -1) * (order.ascending ? 1 : -1);
      });
    }

    return this.limitCount === null ? rows : rows.slice(0, this.limitCount);
  }
}
