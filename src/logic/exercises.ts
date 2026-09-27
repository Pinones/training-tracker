// Fixed ids of the global exercise library seeded in supabase/migrations (…_init.sql).
// Templates reference exercises by these ids.

export const EX = {
  squat: '3103076c-c1e6-4c43-bdfb-385f00bf50ac',
  benchPress: '994c6bbc-6cf5-4d97-806c-9c23d3c051d7',
  deadlift: '0b2f9222-21de-4897-8bc2-67b9b506984c',
  overheadPress: '5d259117-be26-45cc-a763-3303f0e3b13c',
  barbellRow: 'ae61cd00-40eb-4a48-b4c8-70988f846e3a',
  romanianDeadlift: '33ebbcae-e29a-4ead-8b25-0014d0142161',
  hipThrust: 'cafc5ab6-e684-4fef-a716-5de731ab23fb',
  legPress: '342849cc-6275-4e1f-8958-48f6f400b340',
  latPulldown: 'c31bc998-a790-42fd-8cfb-074c32bb940e',
  seatedCableRow: '32b479bd-faa2-491b-a91b-60c21a5e95a8',
  dumbbellPress: '1a1a5569-2213-4377-98aa-dbe3b50af1d0',
  lunges: '5e7db959-ec94-46f4-8479-02f83d856be7',
  bicepsCurl: 'b53652b6-2092-49dc-af9f-fbca7dc0c5e3',
  tricepsPushdown: '20255f98-9030-48a5-b6d5-6d1bc5bba641',
  calfRaise: '5705dbe9-68a3-4695-a2dc-25edd0fbcc7d',
  pushUps: '16bb8026-8e51-4ea0-a86e-023e2b526acc',
  pullUps: 'bc5d7adb-e712-4e88-8d44-fd579b4eb7e5',
  plank: '897546e0-48b3-4a66-b0ba-e4725dea9c7e',
  kettlebellSwings: '0b4a4bff-15eb-48ed-a202-719218f0ec92',
  battleRopes: 'ec5f4218-ad95-4294-b1c5-5b46ab026319',
  bagWork: '40fdf464-ff14-432d-a7cd-12999818cf9a',
} as const;
