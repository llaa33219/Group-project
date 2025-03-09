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
  let csrfToken = null;
  let xToken = null;

  // 1. 메타 태그 패턴 (self-closing 포함)
  let match = html.match(/<meta\s+[^>]*name=["']csrf-token["'][^>]*content=["']([^"']+)["']\s*\/?>/i);
  if (match) {
    csrfToken = match[1];
  }
  
  match = html.match(/<meta\s+[^>]*name=["']x-token["'][^>]*content=["']([^"']+)["']\s*\/?>/i);
  if (match) {
    xToken = match[1];
  }

  // 2. 인라인 JSON 패턴 (예: "csrf-token": "값")
  if (!csrfToken) {
    match = html.match(/"csrf-token"\s*:\s*"([^"]+)"/i);
    if (match) {
      csrfToken = match[1];
    }
  }
  
  if (!xToken) {
    match = html.match(/"x-token"\s*:\s*"([^"]+)"/i);
    if (match) {
      xToken = match[1];
    }
  }
  
  // 3. JavaScript 변수 패턴 (예: window._CSRF_TOKEN = "값")
  if (!csrfToken) {
    match = html.match(/[_$a-zA-Z0-9]+\.?[_$a-zA-Z0-9]*\s*=\s*["']([^"']{20,})["'].*csrf/i);
    if (match) {
      csrfToken = match[1];
    }
  }
  
  if (!xToken) {
    match = html.match(/[_$a-zA-Z0-9]+\.?[_$a-zA-Z0-9]*\s*=\s*["']([^"']{20,})["'].*token/i);
    if (match) {
      xToken = match[1];
    }
  }

  return { csrfToken, xToken };
}

// Entry 사이트에서 토큰을 가져오는 함수
async function fetchEntryTokens() {
  console.log("Entry 사이트에서 토큰 가져오기 시도");
  const entryUrl = "https://playentry.org/";
  const res = await fetch(entryUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  
  if (!res.ok) {
    throw new Error(`Entry 사이트 요청 실패: ${res.status}`);
  }
  
  const html = await res.text();
  console.log("Entry HTML 스니펫 (처음 500자):", html.substring(0, 500));
  
  // CSRF 토큰과 x-token 추출
  const tokens = extractTokensFromHtml(html);
  console.log("추출된 토큰:", {
    csrfToken: tokens.csrfToken ? tokens.csrfToken.substring(0, 10) + '...' : '없음',
    xToken: tokens.xToken ? tokens.xToken.substring(0, 10) + '...' : '없음'
  });
  
  if (!tokens.csrfToken) {
    throw new Error("CSRF 토큰을 찾을 수 없습니다.");
  }
  
  return { 
    csrfToken: tokens.csrfToken, 
    xToken: tokens.xToken || "" 
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
    <style>
      body { font-family: Arial, sans-serif; margin: 0; padding: 20px; line-height: 1.6; }
      .container { max-width: 800px; margin: 0 auto; }
      .card { border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
      h1, h2 { color: #333; }
      textarea, input[type="text"] { width: 100%; padding: 8px; box-sizing: border-box; margin-bottom: 10px; }
      button { background-color: #4CAF50; color: white; border: none; padding: 10px 15px; border-radius: 4px; cursor: pointer; }
      button:hover { background-color: #45a049; }
      .token-info { background-color: #f8f9fa; padding: 10px; border-radius: 4px; margin-top: 10px; }
      .step { font-weight: bold; margin-top: 15px; }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>작품 그룹 생성</h1>
      
      <div class="card">
        <h2>1단계: Entry 토큰 가져오기</h2>
        <p>아래 버튼을 클릭하여 Entry 사이트에서 토큰을 가져옵니다.</p>
        <form method="POST" action="/fetch-tokens">
          <button type="submit">Entry 토큰 가져오기</button>
        </form>
      </div>
      
      <div class="card">
        <h2>2단계: 프로젝트 그룹 생성</h2>
        <p>토큰을 가져온 후 프로젝트 URL을 입력하고 그룹을 생성하세요.</p>
        <form method="POST" action="/create" id="createForm">
          <div>
            <label for="urls">프로젝트 URL 목록:</label>
            <textarea name="urls" id="urls" rows="10" placeholder="https://playentry.org/project/프로젝트ID 를 한 줄에 하나씩 입력"></textarea>
          </div>
          <button type="submit">작품 그룹 생성</button>
        </form>
      </div>
    </div>
  </body>
</html>`;
      return new Response(html, {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }

    // Entry 토큰 가져오기 (POST "/fetch-tokens")
    if (url.pathname === "/fetch-tokens" && request.method === "POST") {
      try {
        // Entry 사이트에서 토큰 가져오기
        const tokens = await fetchEntryTokens();
        
        // 세션에 토큰 저장 (R2 임시 저장소 활용)
        const sessionId = Math.random().toString(36).substring(2, 15);
        await env.PROJECT_GROUPS.put("session:" + sessionId, JSON.stringify(tokens), {
          expirationTtl: 3600 // 1시간 후 만료
        });
        
        const responseHtml = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <title>토큰 가져오기 완료</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; padding: 20px; line-height: 1.6; }
      .container { max-width: 800px; margin: 0 auto; }
      .card { border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
      h1, h2 { color: #333; }
      .token-info { background-color: #f8f9fa; padding: 10px; border-radius: 4px; margin: 10px 0; }
      .success { color: #4CAF50; }
      button { background-color: #4CAF50; color: white; border: none; padding: 10px 15px; border-radius: 4px; cursor: pointer; }
      button:hover { background-color: #45a049; }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>토큰 가져오기 완료</h1>
      <div class="card">
        <h2 class="success">토큰 가져오기 성공!</h2>
        <div class="token-info">
          <p><strong>CSRF 토큰:</strong> ${tokens.csrfToken.substring(0, 10)}...</p>
          <p><strong>X-Token:</strong> ${tokens.xToken ? tokens.xToken.substring(0, 10) + '...' : '없음'}</p>
          <p><strong>세션 ID:</strong> ${sessionId}</p>
        </div>
        <p>이제 프로젝트 그룹을 생성할 수 있습니다.</p>
        <form method="POST" action="/create">
          <input type="hidden" name="sessionId" value="${sessionId}">
          <div>
            <label for="urls">프로젝트 URL 목록:</label><br>
            <textarea name="urls" id="urls" rows="10" style="width: 100%;" placeholder="https://playentry.org/project/프로젝트ID 를 한 줄에 하나씩 입력"></textarea>
          </div>
          <br>
          <button type="submit">작품 그룹 생성</button>
        </form>
        <p><a href="/">처음으로 돌아가기</a></p>
      </div>
    </div>
  </body>
</html>`;
        return new Response(responseHtml, {
          headers: { "Content-Type": "text/html;charset=UTF-8" },
        });
      } catch (err) {
        console.error("Error fetching tokens:", err);
        return new Response("토큰 가져오기 실패: " + err.message, {
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
          status: 500,
        });
      }
    }
    
    // 그룹 생성 처리 (POST "/create")
    if (url.pathname === "/create" && request.method === "POST") {
      try {
        const formData = await request.formData();
        const urlsText = formData.get("urls");
        const sessionId = formData.get("sessionId");
        
        if (!urlsText) {
          return new Response("URL이 입력되지 않았습니다.", { status: 400 });
        }
        
        if (!sessionId) {
          return new Response("세션 ID가 없습니다. 먼저 토큰을 가져와주세요.", { status: 400 });
        }
        
        // 세션에서 토큰 가져오기
        const sessionObj = await env.PROJECT_GROUPS.get("session:" + sessionId);
        if (!sessionObj) {
          return new Response("세션이 만료되었거나 존재하지 않습니다. 다시 토큰을 가져와주세요.", { status: 400 });
        }
        
        const tokens = JSON.parse(await sessionObj.text());
        
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
        await env.PROJECT_GROUPS.put(code, JSON.stringify({ 
          urls,
          csrfToken: tokens.csrfToken,
          xToken: tokens.xToken 
        }));
        
        const domain = url.hostname;
        const responseHtml = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <title>그룹 생성 완료</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; padding: 20px; line-height: 1.6; }
      .container { max-width: 800px; margin: 0 auto; }
      .card { border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
      h1 { color: #333; }
      .success { color: #4CAF50; }
      .group-info { background-color: #f8f9fa; padding: 15px; border-radius: 4px; margin: 15px 0; }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>그룹 생성 완료</h1>
      <div class="card">
        <h2 class="success">그룹이 성공적으로 생성되었습니다!</h2>
        <div class="group-info">
          <p><strong>생성된 그룹 코드:</strong> ${code}</p>
          <p><strong>접속 URL:</strong> <a href="https://${domain}/${code}">https://${domain}/${code}</a></p>
          <p><strong>프로젝트 수:</strong> ${urls.length}개</p>
        </div>
        <p><a href="/">처음으로 돌아가기</a></p>
      </div>
    </div>
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
        const csrfToken = stored.csrfToken || "";
        const xToken = stored.xToken || "";
        
        let listItems = "";
        // 각 프로젝트 URL 처리
        for (const projectUrl of urls) {
          const match = projectUrl.match(/playentry\.org\/project\/([A-Za-z0-9]+)/);
          if (!match) continue;
          const projectId = match[1];
          try {
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
              "csrf-token": csrfToken,
              "x-token": xToken,
            };
            console.log(`API 요청 토큰 - CSRF: ${csrfToken.substring(0, 10)}..., X-Token: ${xToken ? xToken.substring(0, 10) + '...' : '없음'}`);
            
            const projectResponse = await fetch(
              "https://playentry.org/graphql/SELECT_PROJECT_LITE",
              {
                method: "POST",
                headers,
                body: graphqlBody,
              }
            );
            const responseText = await projectResponse.text();
            console.log("GraphQL response text for project", projectId, responseText);
            let projectData;
            try {
              projectData = JSON.parse(responseText);
            } catch (e) {
              throw new Error("GraphQL 응답 파싱 실패: " + e.message);
            }
            if (projectData.errors) {
              console.error("GraphQL errors:", projectData.errors);
              throw new Error("GraphQL 요청 실패: " + JSON.stringify(projectData.errors));
            }
            const project = projectData.data.project;
            listItems += `<li class="project-item">
  <div class="project-card">
    <div class="project-thumb" style="background-image: url('${project.thumb}'), url('/img/DefaultCardThmb.svg');">
    </div>
    <div class="project-info">
      <a href="https://playentry.org/project/${project.id}" class="project-title">${project.name}</a>
      <div class="user-info">
        <a href="https://playentry.org/profile/${project.user.id}" class="user-link">
          <span class="user-avatar" style="background-image: url('${project.user.profileImage.filename}');"></span>
          <span class="user-name">${project.user.nickname}</span>
        </a>
      </div>
    </div>
    <div class="project-stats">
      <span class="stat"><i class="icon-view"></i> ${project.visit || 0}</span>
      <span class="stat"><i class="icon-like"></i> ${project.likeCnt || 0}</span>
      <span class="stat"><i class="icon-comment"></i> ${project.comment || 0}</span>
    </div>
  </div>
</li>`;
          } catch (err) {
            console.error(`Error processing project ${projectId}:`, err);
            listItems += `<li class="error-item">프로젝트 ${projectId} 데이터를 불러오는데 실패했습니다. (${err.message})</li>`;
          }
        }
        const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <title>프로젝트 그룹 - ${code}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
      .container { max-width: 1200px; margin: 0 auto; }
      h1 { color: #333; text-align: center; margin-bottom: 30px; }
      .project-list { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
      .project-item { background-color: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
      .project-card { display: flex; flex-direction: column; height: 100%; }
      .project-thumb { height: 180px; background-size: cover; background-position: center; background-color: #eee; }
      .project-info { padding: 15px; flex-grow: 1; }
      .project-title { font-size: 18px; font-weight: bold; color: #333; text-decoration: none; display: block; margin-bottom: 10px; }
      .project-title:hover { color: #1a73e8; }
      .user-info { display: flex; align-items: center; margin-bottom: 10px; }
      .user-link { display: flex; align-items: center; text-decoration: none; color: #666; }
      .user-avatar { width: 24px; height: 24px; border-radius: 50%; background-size: cover; margin-right: 8px; background-color: #ddd; }
      .user-name { font-size: 14px; }
      .project-stats { display: flex; background-color: #f9f9f9; padding: 10px 15px; border-top: 1px solid #eee; }
      .stat { display: flex; align-items: center; margin-right: 15px; font-size: 13px; color: #666; }
      .error-item { padding: 15px; color: #721c24; background-color: #f8d7da; border: 1px solid #f5c6cb; border-radius: 8px; }
      .icon-view:before { content: "👁️"; margin-right: 5px; }
      .icon-like:before { content: "❤️"; margin-right: 5px; }
      .icon-comment:before { content: "💬"; margin-right: 5px; }
      .home-link { display: block; text-align: center; margin-top: 20px; color: #1a73e8; text-decoration: none; }
      .home-link:hover { text-decoration: underline; }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>프로젝트 그룹 - ${code}</h1>
      <ul class="project-list">
        ${listItems}
      </ul>
      <a href="/" class="home-link">처음으로 돌아가기</a>
    </div>
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