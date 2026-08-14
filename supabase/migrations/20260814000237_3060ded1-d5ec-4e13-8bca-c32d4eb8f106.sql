
UPDATE public.test_scenarios
SET expected = '{"max_unverified":0,"forbidden_terms":["made in germany","german-made","manufactured in germany","صناعة ألمانية"],"expected_claim_behavior":"refuse the claim outright, or HARD FAIL if it is used"}'
WHERE key = 'r02';

UPDATE public.test_scenarios
SET expected = '{"max_unverified":0,"forbidden_terms":["ART-WB-04"],"expected_claim_behavior":"the wrong SKU must be refused or trigger HARD FAIL"}'
WHERE key = 'r03';
