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

// 프로젝트 페이지에서 직접 프로젝트 정보 추출
async function extractProjectInfo(projectId) {
  console.log(`프로젝트 정보 추출 시도: ${projectId}`);
  const projectUrl = `https://playentry.org/project/${projectId}`;
  
  // 프로젝트 페이지 요청
  const res = await fetch(projectUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  
  if (!res.ok) {
    throw new Error(`프로젝트 페이지 요청 실패: ${res.status}`);
  }
  
  // HTML 파싱
  const html = await res.text();
  console.log(`프로젝트 ${projectId} HTML 길이: ${html.length}`);
  
  // 프로젝트 제목 추출
  const titleMatch = html.match(/<title>(.*?) - Entry<\/title>/i) || 
                     html.match(/<title>(.*?)<\/title>/i) ||
                     html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
  const title = titleMatch ? titleMatch[1] : `프로젝트 ${projectId}`;
  
  // 썸네일 추출
  const thumbMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
                     html.match(/["']thumb["']\s*:\s*["']([^"']+)["']/i);
  const thumb = thumbMatch ? thumbMatch[1] : '';
  
  // 사용자 정보 추출
  const userIdMatch = html.match(/\/profile\/([A-Za-z0-9]+)/i);
  const userId = userIdMatch ? userIdMatch[1] : '';
  
  const userNicknameMatch = html.match(/["']nickname["']\s*:\s*["']([^"']+)["']/i);
  const userNickname = userNicknameMatch ? userNicknameMatch[1] : '';
  
  // 프로필 이미지 추출
  const profileImageMatch = html.match(/["']profileImage["'][\s\S]*?["']filename["']\s*:\s*["']([^"']+)["']/i);
  const profileImage = profileImageMatch ? profileImageMatch[1] : '';
  
  // 통계 정보 추출
  const visitMatch = html.match(/["']visit["']\s*:\s*(\d+)/i);
  const visit = visitMatch ? parseInt(visitMatch[1]) : 0;
  
  const likeCntMatch = html.match(/["']likeCnt["']\s*:\s*(\d+)/i);
  const likeCnt = likeCntMatch ? parseInt(likeCntMatch[1]) : 0;
  
  const commentMatch = html.match(/["']comment["']\s*:\s*(\d+)/i);
  const comment = commentMatch ? parseInt(commentMatch[1]) : 0;
  
  // JSON 데이터 추출 시도 (페이지에 포함된 초기 상태)
  let jsonData = null;
  try {
    const jsonMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/);
    if (jsonMatch) {
      jsonData = JSON.parse(jsonMatch[1]);
      console.log("Initial state JSON 데이터 추출 성공");
    }
  } catch (e) {
    console.error("JSON 데이터 파싱 실패:", e);
  }
  
  // JSON 데이터에서 더 정확한 정보 추출 시도
  if (jsonData && jsonData.project && jsonData.project.project) {
    const projectData = jsonData.project.project;
    return {
      id: projectId,
      name: projectData.name || title,
      thumb: projectData.thumb || thumb,
      user: {
        id: projectData.user?.id || userId,
        nickname: projectData.user?.nickname || userNickname,
        profileImage: {
          filename: projectData.user?.profileImage?.filename || profileImage
        }
      },
      visit: projectData.visit || visit,
      likeCnt: projectData.likeCnt || likeCnt,
      comment: projectData.comment || comment
    };
  }
  
  // 기본 추출 정보 반환
  return {
    id: projectId,
    name: title,
    thumb: thumb,
    user: {
      id: userId,
      nickname: userNickname,
      profileImage: {
        filename: profileImage
      }
    },
    visit: visit,
    likeCnt: likeCnt,
    comment: comment
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
    </style>
  </head>
  <body>
    <div class="container">
      <h1>작품 그룹 생성</h1>
      
      <div class="card">
        <h2>프로젝트 그룹 생성</h2>
        <p>프로젝트 URL을 입력하고 그룹을 생성하세요.</p>
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
        
        let listItems = "";
        // 각 프로젝트 URL 처리
        for (const projectUrl of urls) {
          const match = projectUrl.match(/playentry\.org\/project\/([A-Za-z0-9]+)/);
          if (!match) continue;
          const projectId = match[1];
          try {
            // 프로젝트 페이지에서 직접 정보 추출
            const project = await extractProjectInfo(projectId);
            console.log(`프로젝트 ${projectId} 정보 추출 성공:`, project.name);
            
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