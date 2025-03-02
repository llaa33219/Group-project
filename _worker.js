// worker.js

// 토큰 자동 추출 함수
async function extractTokens(projectId) {
    const projectUrl = `https://playentry.org/project/${projectId}`;
    const res = await fetch(projectUrl);
    if (!res.ok) {
      throw new Error(`프로젝트 페이지(${projectUrl}) 요청 실패: ${res.status}`);
    }
    const html = await res.text();
  
    // 예시: 페이지 내에 "csrf-token"과 "x-token"이라는 문자열이 JSON 형태로 포함되어 있다고 가정
    // 실제 HTML 구조에 맞춰서 정규표현식을 수정해야 합니다.
    const csrfTokenMatch = html.match(/"csrf-token"\s*:\s*"([^"]+)"/);
    const xTokenMatch = html.match(/"x-token"\s*:\s*"([^"]+)"/);
    if (!csrfTokenMatch || !xTokenMatch) {
      throw new Error("토큰 추출에 실패했습니다.");
    }
    return {
      csrfToken: csrfTokenMatch[1],
      xToken: xTokenMatch[1],
    };
  }
  
  export default {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
  
      // 메인 페이지: 여러 작품 URL을 입력하는 폼 (GET "/")
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
  
      // 그룹 생성 처리: 폼 전송(POST "/create")
      if (url.pathname === "/create" && request.method === "POST") {
        const formData = await request.formData();
        const urlsText = formData.get("urls");
        if (!urlsText) {
          return new Response("URL이 입력되지 않았습니다.", { status: 400 });
        }
        // 줄 단위로 분리하고 유효한 playentry 프로젝트 URL만 추출
        const urls = urlsText
          .split("\n")
          .map(line => line.trim())
          .filter(line =>
            /^https:\/\/playentry\.org\/project\/[A-Za-z0-9]+/.test(line)
          );
        if (urls.length === 0) {
          return new Response("유효한 URL이 없습니다.", { status: 400 });
        }
        // 8자리(영문/숫자 혼합) 그룹 코드 생성
        const code = Math.random().toString(36).substring(2, 10);
        // R2 버킷에 그룹 정보 저장 (JSON 형태로)
        await env.MY_BUCKET.put(code, JSON.stringify({ urls }));
        // 생성된 URL 반환 (도메인은 현재 요청의 호스트로 사용)
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
      }
  
      // 그룹 페이지: 생성된 8자리 코드로 접속 시 (GET "/{code}")
      if (url.pathname.length === 9 && url.pathname.startsWith("/")) {
        const code = url.pathname.slice(1);
        // R2에서 그룹 정보 가져오기
        const object = await env.MY_BUCKET.get(code);
        if (!object) {
          return new Response("해당 그룹을 찾을 수 없습니다.", { status: 404 });
        }
        const stored = await object.json();
        const urls = stored.urls;
  
        let listItems = "";
        // 각 프로젝트 URL마다 playentry 프로젝트 id 추출 후 GraphQL API 호출
        for (const projectUrl of urls) {
          const match = projectUrl.match(/playentry\.org\/project\/([A-Za-z0-9]+)/);
          if (!match) continue;
          const projectId = match[1];
  
          try {
            // 프로젝트 페이지에서 토큰 자동 추출
            const tokens = await extractTokens(projectId);
  
            // GraphQL 요청 본문 구성
            const graphqlBody = JSON.stringify({
              query: `
                query SELECT_PROJECT($id: ID! $groupId: ID) {
                  project(id: $id, groupId: $groupId) {
                    id
                    name
                    thumb
                    visit
                    likeCnt
                    comment
                    user {
                      id
                      nickname
                      profileImage {
                        filename
                      }
                    }
                  }
                }
              `,
              variables: { id: projectId },
            });
  
            // 추출한 토큰을 사용한 헤더 구성
            const headers = {
              "accept": "*/*",
              "content-type": "application/json",
              "csrf-token": tokens.csrfToken,
              "x-token": tokens.xToken,
            };
  
            const projectResponse = await fetch(
              "https://playentry.org/graphql/SELECT_PROJECT",
              {
                method: "POST",
                headers,
                body: graphqlBody,
              }
            );
            const projectData = await projectResponse.json();
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
          } catch (e) {
            listItems += `<li>프로젝트 ${projectId} 데이터를 불러오는데 실패했습니다.</li>`;
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
      }
  
      return new Response("Not found", { status: 404 });
    },
  };
  