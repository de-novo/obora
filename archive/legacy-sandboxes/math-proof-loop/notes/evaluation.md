# Math Proof Loop Evaluation

## 1. Problem Framing Quality
- 문제 정의가 정확한가
- conjecture / assumptions / known facts가 분리됐는가

## 2. Proof Search Quality
- lemma 후보가 유의미한가
- proof attempt가 구조화되어 있는가
- 숨은 가정이 드러나는가

## 3. Counterexample Resistance
- 반례 점검이 독립적으로 수행되는가
- consistency check가 형식적이지 않은가

## 4. Remediation Quality
- 같은 proof gap 반복을 줄이는가
- false progress를 줄이는가

## 5. Archive Usefulness
- 후속 시도자가 바로 이어볼 수 있는가
- proof-gap register가 유의미한가

## 판정
- PASS: bounded/successful conclusion과 탐색 기록이 모두 유의미함
- SOFT_FAIL: 탐색 기록은 있으나 false progress 억제가 약함
- FAIL: 증명 공백/반례 가능성을 숨기거나 구조가 무너짐
