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

// 주어진 HTML에서 CSRF 토큰만 추출하는 함수 (x-token은 로컬 스토리지에서 가져옴)
function extractTokensFromHtml(html) {
  let csrfToken = null;

  // 1. 메타 태그 패턴 (self-closing 포함)
  let match = html.match(/<meta\s+[^>]*name=["']csrf-token["'][^>]*content=["']([^"']+)["']\s*\/?>/i);
  if (match) {
    csrfToken = match[1];
  }

  // 2. 인라인 JSON 패턴 (예: "csrf-token": "값")
  if (!csrfToken) {
    match = html.match(/"csrf-token"\s*:\s*"([^"]+)"/i);
    if (match) {
      csrfToken = match[1];
    }
  }

  return { csrfToken };
}

// 프로젝트 페이지에서 CSRF 토큰을 추출하는 함수 (x-token은 전달받음)
async function extractTokensFromProject(projectId, xToken) {
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
  const tokens = extractTokensFromHtml(sanitizedHtml);
  if (!tokens.csrfToken) {
    throw new Error(
      "토큰 추출에 실패했습니다. CSRF 토큰을 찾을 수 없습니다. HTML snippet:\n" +
        escapeHtml(sanitizedHtml)
    );
  }
  return { csrfToken: tokens.csrfToken, xToken: xToken };
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
    <script>
      // 페이지 로드 시 로컬 스토리지에서 playentry_token 값을 가져와 토큰 입력란에 자동 기입
      window.addEventListener('DOMContentLoaded', function() {
        const playtokenField = document.getElementById('playentry_token');
        const token = localStorage.getItem('playentry_token');
        if (token) {
          playtokenField.value = token;
          console.log('Token loaded from localStorage');
        } else {
          console.log('No token found in localStorage');
        }
      });
    </script>
  </head>
  <body>
    <h1>작품 그룹 생성</h1>
    <form method="POST" action="/create">
      <div>
        <label for="playentry_token">Entry 토큰 (자동으로 가져옴):</label><br/>
        <input type="text" id="playentry_token" name="playentry_token" style="width:100%"><br/>
        <small>자동으로 로컬 스토리지에서 불러옵니다. 토큰이 보이지 않는다면 playentry.org에 로그인해주세요.</small>
      </div>
      <br/>
      <div>
        <label for="urls">프로젝트 URL 목록:</label><br/>
        <textarea name="urls" id="urls" rows="10" cols="50" placeholder="https://playentry.org/project/프로젝트ID 를 한 줄에 하나씩 입력"></textarea>
      </div>
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
        const xToken = formData.get("playentry_token") || ""; // 사용자가 제공한 playentry_token
        
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
        await env.PROJECT_GROUPS.put(code, JSON.stringify({ urls, xToken })); // xToken도 함께 저장
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
        const xToken = stored.xToken || ""; // 저장된 x-token 가져오기
        let listItems = "";
        // 각 프로젝트 URL 처리
        for (const projectUrl of urls) {
          const match = projectUrl.match(/playentry\.org\/project\/([A-Za-z0-9]+)/);
          if (!match) continue;
          const projectId = match[1];
          try {
            // 프로젝트 페이지에서 CSRF 토큰 추출 (x-token은 이미 가지고 있음)
            const tokens = await extractTokensFromProject(projectId, xToken);
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
              "x-token": tokens.xToken, // 로컬 스토리지에서 가져온 토큰
            };
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