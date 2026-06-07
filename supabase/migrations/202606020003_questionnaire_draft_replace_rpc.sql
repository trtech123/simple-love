create or replace function public.replace_draft_questionnaire_version(
  p_version_id uuid,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_block jsonb;
  v_question jsonb;
  v_option jsonb;
  v_block_id uuid;
  v_question_id uuid;
begin
  select status into v_status
  from public.questionnaire_versions
  where id = p_version_id
  for update;

  if v_status is null then
    raise exception 'Version was not found';
  end if;

  if v_status <> 'draft' then
    raise exception 'Only draft versions can be edited';
  end if;

  delete from public.questionnaire_blocks
  where questionnaire_version_id = p_version_id;

  for v_block in
    select value from jsonb_array_elements(coalesce(p_payload->'blocks', '[]'::jsonb))
  loop
    insert into public.questionnaire_blocks (questionnaire_version_id, title, position)
    values (p_version_id, v_block->>'title', (v_block->>'position')::integer)
    returning id into v_block_id;

    for v_question in
      select value from jsonb_array_elements(coalesce(v_block->'questions', '[]'::jsonb))
    loop
      insert into public.questions (
        questionnaire_block_id,
        stable_key,
        prompt,
        question_type,
        position,
        usage_flags,
        trait_mapping
      )
      values (
        v_block_id,
        v_question->>'stableKey',
        v_question->>'prompt',
        (v_question->>'questionType')::public.question_type,
        (v_question->>'position')::integer,
        coalesce(v_question->'usageFlags', '{}'::jsonb),
        '{}'::jsonb
      )
      returning id into v_question_id;

      for v_option in
        select value from jsonb_array_elements(coalesce(v_question->'options', '[]'::jsonb))
      loop
        insert into public.question_options (question_id, label, value, position, score)
        values (
          v_question_id,
          v_option->>'label',
          v_option->>'value',
          (v_option->>'position')::integer,
          '{}'::jsonb
        );
      end loop;
    end loop;
  end loop;
end;
$$;
