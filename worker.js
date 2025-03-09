// worker.js

// HTML 문자열 내의 특수문자를 이스케이프하는 함수 (디버깅용)
function escapeHtml(html) {
  return html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// 주어진 HTML에서 CSRF 토큰과 x-token을 추출하는 함수
function extractTokensFromHtml(html) {
  // CSRF 토큰 추출
  const csrfResult = extractCsrfTokenFromHtml(html);
  
  // X-Token 추출
  const xTokenResult = extractXTokenFromHtml(html);
  
  console.log("토큰 추출 요약:");
  console.log(`- CSRF 토큰: ${csrfResult.token ? '찾음' : '찾지 못함'} (방법: ${csrfResult.method})`);
  console.log(`- X-Token: ${xTokenResult.token ? '찾음' : '찾지 못함'} (방법: ${xTokenResult.method})`);
  
  return { 
    csrfToken: csrfResult.token, 
    xToken: xTokenResult.token,
    csrfMethod: csrfResult.method,
    xTokenMethod: xTokenResult.method
  };
}

// CSRF 토큰 추출 함수
function extractCsrfTokenFromHtml(html) {
  let csrfToken = null;
  let method = "";
  
  console.log("CSRF 토큰 추출 시작...");
  
  // 1. 먼저 meta 태그에서 찾기 (self-closing 포함)
  console.log("1. meta 태그에서 CSRF 토큰 찾기 시도...");
  let match = html.match(/<meta\s+[^>]*name=["']csrf-token["'][^>]*content=["']([^"']+)["']\s*\/?>/i);
  if (match) {
    csrfToken = match[1];
    method = "meta 태그";
    console.log(`✅ meta 태그에서 CSRF 토큰 찾음: ${csrfToken.substring(0, 10)}...`);
    return { token: csrfToken, method };
  }
  console.log("❌ meta 태그에서 CSRF 토큰을 찾지 못함");
  
  // 2. HTML 내의 스크립트에서 찾기
  console.log("2. 스크립트 태그에서 CSRF 토큰 찾기 시도...");
  const scriptPattern = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let scriptMatch;
  let scriptCount = 0;
  
  while ((scriptMatch = scriptPattern.exec(html)) !== null) {
    scriptCount++;
    const scriptContent = scriptMatch[1];
    
    // 다양한 CSRF 토큰 패턴 찾기
    const csrfPatterns = [
      { pattern: /csrfToken[\s]*[=:][\s]*["']([^"']+)["']/, name: "csrfToken 변수" },
      { pattern: /"csrf-token"[\s]*[=:][\s]*["']([^"']+)["']/, name: "csrf-token JSON 키" },
      { pattern: /csrf_token[\s]*[=:][\s]*["']([^"']+)["']/, name: "csrf_token 변수" }
    ];
    
    for (const { pattern, name } of csrfPatterns) {
      match = scriptContent.match(pattern);
      if (match && match[1]) {
        csrfToken = match[1];
        method = `스크립트 내 ${name}`;
        console.log(`✅ 스크립트 #${scriptCount}의 ${name}에서 CSRF 토큰 찾음: ${csrfToken.substring(0, 10)}...`);
        return { token: csrfToken, method };
      }
    }
  }
  console.log(`❌ ${scriptCount}개의 스크립트 태그에서 CSRF 토큰을 찾지 못함`);
  
  // 3. 폼 요소에서 찾기
  console.log("3. 폼 입력 요소에서 CSRF 토큰 찾기 시도...");
  const formInputPatterns = [
    { pattern: /<input[^>]*name=["']_csrf["'][^>]*value=["']([^"']+)["'][^>]*>/i, name: "_csrf 입력" },
    { pattern: /<input[^>]*name=["']csrf-token["'][^>]*value=["']([^"']+)["'][^>]*>/i, name: "csrf-token 입력" },
    { pattern: /<input[^>]*name=["']csrf["'][^>]*value=["']([^"']+)["'][^>]*>/i, name: "csrf 입력" }
  ];
  
  for (const { pattern, name } of formInputPatterns) {
    match = html.match(pattern);
    if (match && match[1]) {
      csrfToken = match[1];
      method = `폼 ${name}`;
      console.log(`✅ ${name}에서 CSRF 토큰 찾음: ${csrfToken.substring(0, 10)}...`);
      return { token: csrfToken, method };
    }
  }
  console.log("❌ 폼 입력 요소에서 CSRF 토큰을 찾지 못함");
  
  // 4. 인라인 JSON 패턴 확인
  console.log("4. 인라인 JSON에서 CSRF 토큰 찾기 시도...");
  match = html.match(/"csrf-token"\s*:\s*"([^"]+)"/i);
  if (match) {
    csrfToken = match[1];
    method = "인라인 JSON";
    console.log(`✅ 인라인 JSON에서 CSRF 토큰 찾음: ${csrfToken.substring(0, 10)}...`);
    return { token: csrfToken, method };
  }
  console.log("❌ 인라인 JSON에서 CSRF 토큰을 찾지 못함");
  
  console.log("⚠️ 모든 방법으로 CSRF 토큰 추출 시도 실패");
  return { token: null, method: "찾지 못함" };
}

// X-Token 추출 함수
function extractXTokenFromHtml(html) {
  let xToken = null;
  let method = "";
  
  console.log("X-Token 추출 시작...");
  
  // 1. 먼저 meta 태그에서 찾기
  console.log("1. meta 태그에서 X-Token 찾기 시도...");
  let match = html.match(/<meta\s+[^>]*name=["']x-token["'][^>]*content=["']([^"']+)["']\s*\/?>/i);
  if (match) {
    xToken = match[1];
    method = "meta 태그";
    console.log(`✅ meta 태그에서 X-Token 찾음: ${xToken.substring(0, 10)}...`);
    return { token: xToken, method };
  }
  console.log("❌ meta 태그에서 X-Token을 찾지 못함");
  
  // 2. HTML 내의 스크립트에서 X-Token 찾기
  console.log("2. 스크립트 태그에서 X-Token 찾기 시도...");
  const scriptPattern = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let scriptMatch;
  let scriptCount = 0;
  
  while ((scriptMatch = scriptPattern.exec(html)) !== null) {
    scriptCount++;
    const scriptContent = scriptMatch[1];
    
    // X-Token을 포함할 수 있는 다양한 패턴 찾기
    const tokenPatterns = [
      { pattern: /token[\s]*[=:][\s]*["']([^"']+)["']/, name: "token 변수" },
      { pattern: /x-token[\s]*[=:][\s]*["']([^"']+)["']/, name: "x-token 변수" },
      { pattern: /xToken[\s]*[=:][\s]*["']([^"']+)["']/, name: "xToken 변수" },
      { pattern: /authToken[\s]*[=:][\s]*["']([^"']+)["']/, name: "authToken 변수" }
    ];
    
    for (const { pattern, name } of tokenPatterns) {
      match = scriptContent.match(pattern);
      if (match && match[1]) {
        xToken = match[1];
        method = `스크립트 내 ${name}`;
        console.log(`✅ 스크립트 #${scriptCount}의 ${name}에서 X-Token 찾음: ${xToken.substring(0, 10)}...`);
        return { token: xToken, method };
      }
    }
  }
  console.log(`❌ ${scriptCount}개의 스크립트 태그에서 X-Token을 찾지 못함`);
  
  // 3. data 속성에서 찾기
  console.log("3. HTML 요소의 data 속성에서 X-Token 찾기 시도...");
  const dataAttrPatterns = [
    { pattern: /<[^>]*data-token=["']([^"']+)["'][^>]*>/i, name: "data-token 속성" },
    { pattern: /<[^>]*data-x-token=["']([^"']+)["'][^>]*>/i, name: "data-x-token 속성" }
  ];
  
  for (const { pattern, name } of dataAttrPatterns) {
    match = html.match(pattern);
    if (match && match[1]) {
      xToken = match[1];
      method = `HTML ${name}`;
      console.log(`✅ HTML 요소의 ${name}에서 X-Token 찾음: ${xToken.substring(0, 10)}...`);
      return { token: xToken, method };
    }
  }
  console.log("❌ HTML 요소의 data 속성에서 X-Token을 찾지 못함");
  
  // 4. JWT 패턴 찾기 (페이지 전체에서)
  console.log("4. JWT 패턴으로 X-Token 찾기 시도...");
  const jwtPattern = /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[^"'\s<>]+\.[^"'\s<>]+/g;
  const jwtMatches = html.match(jwtPattern);
  
  if (jwtMatches && jwtMatches.length > 0) {
    xToken = jwtMatches[0]; // 첫 번째 JWT 형식 토큰 사용
    method = "JWT 패턴";
    console.log(`✅ JWT 패턴으로 X-Token 찾음: ${xToken.substring(0, 10)}...`);
    return { token: xToken, method };
  }
  console.log("❌ JWT 패턴으로 X-Token을 찾지 못함");
  
  // 5. 인라인 JSON 패턴 확인
  console.log("5. 인라인 JSON에서 X-Token 찾기 시도...");
  match = html.match(/"x-token"\s*:\s*"([^"]+)"/i);
  if (match) {
    xToken = match[1];
    method = "인라인 JSON";
    console.log(`✅ 인라인 JSON에서 X-Token 찾음: ${xToken.substring(0, 10)}...`);
    return { token: xToken, method };
  }
  console.log("❌ 인라인 JSON에서 X-Token을 찾지 못함");
  
  console.log("⚠️ 모든 방법으로 X-Token 추출 시도 실패");
  return { token: null, method: "찾지 못함" };
}

// 프로젝트 페이지에서 토큰을 추출하는 함수
async function extractTokensFromProject(projectId) {
  const projectUrl = `https://playentry.org/project/${projectId}`;
  console.log(`Fetching project page: ${projectUrl}`);
  const res = await fetch(projectUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!res.ok) {
    throw new Error(`프로젝트 페이지(${projectUrl}) 요청 실패: ${res.status}`);
  }
  const html = await res.text();
  console.log("Project HTML snippet (first 500 chars):", html.substring(0, 500));
  // 스크립트 태그 제거(디버깅 시 HTML 노이즈 제거)
  const sanitizedHtml = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  console.log("Sanitized HTML snippet:", sanitizedHtml.substring(0, 500));
  const tokens = extractTokensFromHtml(html); // 여기서는 원본 HTML 사용(스크립트 포함)
  
  // 토큰 추출 결과 상세 로깅
  if (!tokens.csrfToken) {
    throw new Error(
      `토큰 추출 실패 정보:
      - CSRF 토큰: 찾지 못함 (시도한 방법: ${tokens.csrfMethod})
      - X-Token: ${tokens.xToken ? '찾음' : '찾지 못함'} (시도한 방법: ${tokens.xTokenMethod})
      
      HTML snippet 샘플 (처음 200자):
      ${escapeHtml(html.substring(0, 200))}...`
    );
  }
  
  // xToken은 없으면 빈 문자열로 처리
  console.log(`프로젝트 ${projectId}의 토큰 추출 성공: CSRF(${tokens.csrfMethod}), X-Token(${tokens.xTokenMethod})`);
  return { 
    csrfToken: tokens.csrfToken, 
    xToken: tokens.xToken ? tokens.xToken : "", 
    csrfMethod: tokens.csrfMethod,
    xTokenMethod: tokens.xTokenMethod
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    console.log("Incoming request:", url.toString());

    // 메인 페이지: URL 입력 폼 (GET "/")
    if (url.pathname === "/" && request.method === "GET") {
      const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <title>작품 그룹 생성</title>
  </head>
  <body>
    <h1>작품 그룹 생성</h1>
    <form method="POST" action="/create">
      <textarea name="urls" rows="10" cols="50" placeholder="https://playentry.org/project/프로젝트ID 를 한 줄에 하나씩 입력"></textarea>
      <br/>
      <button type="submit">작품 그룹 생성</button>
    </form>
  </body>
</html>`;
      return new Response(html, {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }

    // 그룹 생성 처리 (POST "/create")
    if (url.pathname === "/create" && request.method === "POST") {
      try {
        const formData = await request.formData();
        const urlsText = formData.get("urls");
        if (!urlsText) {
          return new Response("URL이 입력되지 않았습니다.", { status: 400 });
        }
        // 줄 단위로 분리 후 유효한 URL 필터링
        const urls = urlsText
          .split("\n")
          .map(line => line.trim())
          .filter(line =>
            /^https:\/\/playentry\.org\/project\/[A-Za-z0-9]+/.test(line)
          );
        if (urls.length === 0) {
          return new Response("유효한 URL이 없습니다.", { status: 400 });
        }
        // 8자리 그룹 코드 생성
        const code = Math.random().toString(36).substring(2, 10);
        // R2 버킷 (PROJECT_GROUPS 바인딩) 저장 (JSON 형태)
        await env.PROJECT_GROUPS.put(code, JSON.stringify({ urls }));
        const domain = url.hostname;
        const responseHtml = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <title>그룹 생성 완료</title>
  </head>
  <body>
    <h1>그룹 생성 완료</h1>
    <p>생성된 그룹 코드: <strong>${code}</strong></p>
    <p>접속 URL: <a href="https://${domain}/${code}">https://${domain}/${code}</a></p>
  </body>
</html>`;
        return new Response(responseHtml, {
          headers: { "Content-Type": "text/html;charset=UTF-8" },
        });
      } catch (err) {
        console.error("Error in /create:", err);
        return new Response("그룹 생성 중 에러 발생: " + err.message, {
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
          status: 500,
        });
      }
    }

    // 그룹 페이지: 생성된 8자리 코드로 접속 (GET "/{code}")
    if (url.pathname.length === 9 && url.pathname.startsWith("/")) {
      const code = url.pathname.slice(1);
      try {
        // R2에서 그룹 정보 가져오기
        const object = await env.PROJECT_GROUPS.get(code);
        if (!object) {
          return new Response("해당 그룹을 찾을 수 없습니다.", { status: 404 });
        }
        const stored = await object.json();
        const urls = stored.urls;
        let listItems = "";
        // 각 프로젝트 URL 처리
        for (const projectUrl of urls) {
          const match = projectUrl.match(/playentry\.org\/project\/([A-Za-z0-9]+)/);
          if (!match) continue;
          const projectId = match[1];
          try {
            // 프로젝트 페이지에서 CSRF 토큰 및 x-token을 함께 추출
            const tokens = await extractTokensFromProject(projectId);
            console.log(`Tokens for project ${projectId}:`, tokens);
            // GraphQL 요청 본문 구성 (SELECT_PROJECT_LITE 사용)
            const graphqlBody = JSON.stringify({
              query: `
                query SELECT_PROJECT_LITE($id: ID! $groupId: ID) {
                  project(id: $id, groupId: $groupId) {
                    id
                    name
                    user {
                      id
                      nickname
                      profileImage {
                        filename
                      }
                    }
                    thumb
                    visit
                    likeCnt
                    comment
                  }
                }
              `,
              variables: { id: projectId },
            });
            // 헤더 구성 (추출한 토큰 사용)
            const headers = {
              "accept": "*/*",
              "content-type": "application/json",
              "csrf-token": tokens.csrfToken,
              "x-token": tokens.xToken, // 없으면 빈 문자열
            };
            // GraphQL 요청 실행 전 헤더 로깅
            console.log(`프로젝트 ${projectId}에 대한 GraphQL 요청 헤더:`, headers);
            
            const projectResponse = await fetch(
              "https://playentry.org/graphql/SELECT_PROJECT_LITE",
              {
                method: "POST",
                headers,
                body: graphqlBody,
              }
            );
            
            // 응답 상태 코드 및 헤더 확인
            console.log(`GraphQL 응답 상태 코드 (${projectId}):`, projectResponse.status);
            console.log(`GraphQL 응답 Content-Type (${projectId}):`, projectResponse.headers.get('content-type'));
            
            const responseText = await projectResponse.text();
            
            // 응답의 처음 200자만 로깅 (너무 길면 로그가 가독성이 떨어짐)
            console.log(`GraphQL 응답 미리보기 (${projectId}):`, 
              responseText.length > 200 
                ? responseText.substring(0, 200) + "..." 
                : responseText
            );
            
            let projectData;
            try {
              // HTML인지 확인 (응답이 <로 시작하는지)
              if (responseText.trim().startsWith('<')) {
                throw new Error(`HTML 응답 받음 (응답 코드: ${projectResponse.status}). 인증/권한 문제 가능성 높음`);
              }
              
              projectData = JSON.parse(responseText);
            } catch (e) {
              throw new Error(`GraphQL 응답 파싱 실패: ${e.message}\n응답 미리보기: ${responseText.substring(0, 100)}...`);
            }
            if (projectData.errors) {
              console.error("GraphQL errors:", projectData.errors);
              throw new Error("GraphQL 요청 실패");
            }
            const project = projectData.data.project;
            listItems += `<li>
  <div data-testid="wrapper" class="css-ul67nl e1lvzky422">
    <a class="tagmanagerundefined css-kkg74o e1lvzky421" href="/project/${project.id}" style="background-image: url('${project.thumb}'), url('/img/DefaultCardThmb.svg');">
      <div class="css-tukhj5 e1lvzky419">
        <div class="css-1ctr5g5 e1lvzky418">기타</div>
      </div>
    </a>
    <div class="tagmanagerundefined css-1v0yvbh e1lvzky413">
      <a class="tagmanagerundefined css-1iem5wd e1lvzky412" href="/project/${project.id}">${project.name}</a>
      <div class="css-127drii e1lvzky410">
        <a href="/profile/${project.user.id}">
          <span style="background-image: url('${project.user.profileImage.filename}');">&nbsp;</span>
          <em>${project.user.nickname}</em>
        </a>
      </div>
    </div>
    <div class="css-xj5nm9 e1lvzky49">
      <span><em class="viewCount css-1lkc9et e1lvzky48"><em class="blind">뷰 :</em></em>${project.visit || 0}</span>
      <span><em class="Heart css-1lkc9et e1lvzky48"><em class="blind">좋아요 :</em></em>${project.likeCnt || 0}</span>
      <span><em class="Comment css-1lkc9et e1lvzky48"><em class="blind">댓글 :</em></em>${project.comment || 0}</span>
    </div>
    <div class="css-1iimju e1lvzky46"><span class="blind">체크</span></div>
  </div>
</li>`;
          } catch (err) {
            console.error(`Error processing project ${projectId}:`, err);
            listItems += `<li>프로젝트 ${projectId} 데이터를 불러오는데 실패했습니다. (${err.message})</li>`;
          }
        }
        const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <title>프로젝트 그룹 - ${code}</title>
  </head>
  <body>
    <h1>프로젝트 그룹 - ${code}</h1>
    <ul>
      ${listItems}
    </ul>
  </body>
</html>`;
        return new Response(html, {
          headers: { "Content-Type": "text/html;charset=UTF-8" },
        });
      } catch (err) {
        console.error("Error in group page:", err);
        return new Response("그룹 페이지 처리 중 에러 발생: " + err.message, {
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
          status: 500,
        });
      }
    }

    return new Response("Not found", { status: 404 });
  },
};